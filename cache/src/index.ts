import { Effect } from "effect";
import { RevalidationCoordinator } from "./coordinator";

import { detectVersionMismatch } from "./effects/version";
import { getCachedResponse, setCachedResponse } from "./effects/cache";
import { buildCacheKey } from "./utils";
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

		const cachePrefix = "docs";
		const projectId = "default_project"; // TODO: multi project support later

		console.log("Using cache prefix:", cachePrefix, "and project ID:", projectId);
		const deploymentId = yield* Effect.tryPromise({
			try: () => env.CACHE_KV.get<string>(`DEPLOY:${host}`),
			catch: (err) => new Error(`Failed to get deployment ID from KV: ${String(err)}`)
		});

		console.log("Resolved deployment ID:", deploymentId);

		if (!deploymentId) {
			// ig this is when there are no deployments so it'll just proxy to origin
			console.log("No deployment ID found, proxying to origin");
			return yield* Effect.tryPromise({
				try: () => fetch(env.ORIGIN_URL + url.pathname),
				catch: (err) => new Error(`Failed to proxy to origin: ${String(err)}`)
			});
		}

		const contentType = request.headers.get("RSC") === "1" ? "rsc" : "html"
		const cacheKey = buildCacheKey(cachePrefix, deploymentId, url.pathname, contentType)

		const cachedResponse = yield* getCachedResponse(cacheKey);
		
		if (cachedResponse) {
			console.log("Cache hit for:", cacheKey);
			
			const originResponse = yield* Effect.tryPromise({
				try: () => fetch(env.ORIGIN_URL + url.pathname, {
					headers: request.headers
				}),
				catch: (error) => new Error(`Origin fetch failed: ${error}`)
			});

			const versionCheck = yield* detectVersionMismatch(
				originResponse,
				env.CACHE_KV,
			);

			if (versionCheck.shouldRevalidate && versionCheck.wantVersion) {
				console.log("Version mismatch detected, triggering background revalidation");
				ctx.waitUntil(
					triggerRevalidation(env, {
						cachePrefix,
						deploymentId: versionCheck.wantVersion,
						originUrl: env.ORIGIN_URL,
						projectId,
						domain: host
					})
				);
			}

			return cachedResponse;
		}

		console.log("Cache miss for:", cacheKey);

		const originResponse = yield* Effect.tryPromise({
			try: () => fetch(env.ORIGIN_URL + url.pathname, {
				headers: request.headers
			}),
			catch: (error) => new Error(`Origin fetch failed: ${error}`)
		});

		// this is basicallyt cache miss and i set it here

		const versionCheck = yield* detectVersionMismatch(
			originResponse,
			env.CACHE_KV,
		);
		console.log("Version check result:", versionCheck);

		if (versionCheck.shouldRevalidate && versionCheck.wantVersion) {
			console.log("Version mismatch detected, triggering revalidation");
			// this is bg revalidation trigger (no queueing for now cause im broke)
			ctx.waitUntil(
				triggerRevalidation(env, {
					cachePrefix,
					deploymentId: versionCheck.wantVersion,
					originUrl: env.ORIGIN_URL,
					projectId,
					domain: host
				})
			);
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
