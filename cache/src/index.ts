import { Effect } from "effect";
import { RevalidationCoordinator } from "./coordinator";

import { detectVersionMismatch } from "./effects/version";
import { getCachedResponse, setCachedResponse } from "./effects/cache";
import { buildCacheKey } from "./utils";
import { configOriginKey, configPrefixKey, configProjectKey, deployExpectedVersionKey, deploymentActiveKey } from "./keys";
import type { Env, DeploymentConfig, PrewarmRequest } from "./types";
import { CACHE_TTL_SECONDS } from "./constants";
import { handleDeploymentWebhook } from "./handlers/webhook";

export { RevalidationCoordinator }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);

	if (url.pathname == '/prewarm') {
		return handlePrewarm(request, env, ctx);
	}

	if (url.pathname === '/webhook/deployment') {
		return handleDeploymentWebhook(request, env);
	}

	// essentially the main thing that sits in front of everything
	return handleProxy(request, env, ctx);
  }
}


async function handleProxy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const program = Effect.gen(function* () {
		const url = new URL(request.url);
		const host = request.headers.get("host") ?? "UNKNOWN"; // honestly not sure when this would be missing
		
		console.log("Handling request for host:", host, "path:", url.pathname);

		// this is for multiple tenants, im assuming mintlify is doing something similar as well
		const cachePrefix = (yield* Effect.tryPromise({
			try: () => env.CACHE_KV.get<string>(configPrefixKey(host)),
			catch: (err) => new Error(`Failed to get cache prefix: ${String(err)}`)
		})) ?? "docs";

		const projectId = (yield* Effect.tryPromise({
			try: () => env.CACHE_KV.get<string>(configProjectKey(host)),
			catch: (err) => new Error(`Failed to get project ID: ${String(err)}`)
		})) ?? "default_project";

		const originUrl = (yield* Effect.tryPromise({
			try: () => env.CACHE_KV.get<string>(configOriginKey(host)),
			catch: (err) => new Error(`Failed to get origin URL: ${String(err)}`)
		})) ?? env.ORIGIN_URL;

		console.log("Multi-tenant config - prefix:", cachePrefix, "projectId:", projectId, "origin:", originUrl);

		const deploymentId = yield* Effect.tryPromise({
			try: () => env.CACHE_KV.get<string>(deploymentActiveKey(host)),
			catch: (err) => new Error(`Failed to get deployment ID from KV: ${String(err)}`)
		});

		console.log("Resolved deployment ID:", deploymentId);

		if (!deploymentId) {
			// ig this is when there are no deployments so it'll just proxy to origin
			console.log("No deployment ID found, proxying to origin");
			return yield* Effect.tryPromise({
				try: () => fetch(originUrl + url.pathname, {
					headers: request.headers
				}),
				catch: (err) => new Error(`Failed to proxy to origin: ${String(err)}`)
			});
		}

		const contentType = request.headers.get("RSC") === "1" ? "rsc" : "html"
		const cacheKey = buildCacheKey(cachePrefix, deploymentId, url.pathname, contentType)

		const cachedResponse = yield* getCachedResponse(cacheKey);
		
		if (cachedResponse) {
			console.log("Cache hit for:", cacheKey);
			return cachedResponse;
		}

		console.log("Cache miss for:", cacheKey);

		const originResponse = yield* Effect.tryPromise({
			try: () => fetch(originUrl + url.pathname, {
				headers: request.headers
			}),
			catch: (error) => new Error(`Origin fetch failed: ${error}`)
		});

		// mintlify seems to do some version mismatch detection here as well
		const gotVersion = originResponse.headers.get("x-version");
		const originProjectId = originResponse.headers.get("x-vercel-project-id");

		// this is to compare against expected version from webhook (DEPLOY:{projectId}:id)
		if (gotVersion && originProjectId) {
			const wantVersion = yield* Effect.tryPromise({
				try: () => env.CACHE_KV.get<string>(deployExpectedVersionKey(originProjectId)),
				catch: (err) => new Error(`Failed to get expected version: ${String(err)}`)
			});

			const shouldRevalidate = wantVersion !== null && wantVersion !== gotVersion;
			
			if (shouldRevalidate) {
				console.log("Version mismatch detected - got:", gotVersion, "want:", wantVersion);
				// this is bg revalidation trigger (no queueing for now cause im broke)
				ctx.waitUntil(
					triggerRevalidation(env, {
						cachePrefix,
						deploymentId: wantVersion!,
						originUrl,
						projectId: originProjectId,
						domain: host
					})
				);
			}
		}

		if (originResponse.ok) {
			const responseToCache = originResponse.clone();
			const headers = new Headers(responseToCache.headers);
			headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
			
			const cacheable = new Response(responseToCache.body, {
				status: responseToCache.status,
				statusText: responseToCache.statusText,
				headers
			});
			
			yield* setCachedResponse(cacheKey, cacheable);
		}

		return originResponse;
	})

	return Effect.runPromise(program);
}

async function triggerRevalidation(env: Env, config: DeploymentConfig, paths?: string[]): Promise<void> {
  const program = Effect.gen(function* () {
    const doId = env.COORDINATOR.idFromName(`revalidation:${config.projectId}`)
    const doStub = env.COORDINATOR.get(doId) as DurableObjectStub<RevalidationCoordinator>
    
    const result = yield* Effect.tryPromise({
      try: () => {
		console.log("Triggering revalidation for deployment:", config.deploymentId)
		return doStub.startRevalidation(config, paths)
	  },
      catch: (error) => new Error(`Revalidation failed: ${error}`)
    })
    
    console.log("Revalidation result:", result)
  })
  
  await Effect.runPromise(program)
}

async function handlePrewarm(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const program = Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<PrewarmRequest>,
      catch: (error) => new Error(`Invalid request body: ${error}`)
    });

    const config: DeploymentConfig = {
      cachePrefix: body.cachePrefix,
      deploymentId: body.deploymentId,
      originUrl: body.originUrl,
      projectId: body.projectId,
      domain: body.domain
    };

    const doId = env.COORDINATOR.idFromName(`revalidation:${config.projectId}`);
    const doStub = env.COORDINATOR.get(doId) as DurableObjectStub<RevalidationCoordinator>;
    
    yield* Effect.tryPromise({
      try: () => doStub.updateDocVersion(config.deploymentId),
      catch: (error) => new Error(`Failed to update doc version: ${error}`)
    });

    ctx.waitUntil(triggerRevalidation(env, config, body.paths));
    
    return new Response(JSON.stringify({ status: "queued" }), {
      headers: { "Content-Type": "application/json" }
    });
  });
  
  return Effect.runPromise(program);
}
