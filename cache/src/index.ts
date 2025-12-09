import { Effect } from "effect";
import { RevalidationCoordinator } from "./coordinator";

import { detectVersionMismatch } from "./effects/version";
import { buildCacheKey } from "./utils";
import type { Env, DeploymentConfig } from "./types";
import { setRequestCache } from "effect/Layer";

export { RevalidationCoordinator }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);

	if (url.pathname == '/prewarm') {
		// dea; with prewarming here
	}

	// essentially the main thing that sits in front of everything
	return handleProxy(request, env, ctx);
  }
}


async function handleProxy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const program = Effect.gen(function* () {
		const url = new URL(request.url);
		const host = request.headers.get("host") ?? "UNKNOWN"; // honestly not sure when this would be missing
		
		const cachePrefix = "docs";
		const projectId = "default_project"; // TODO: multi project support later

		const deploymentId = yield* Effect.tryPromise({
			try: () => env.CACHE_KV.get<string>(`DEPLOY:${host}`),
			catch: (err) => new Error(`Failed to get deployment ID from KV: ${String(err)}`)
		});

		if (!deploymentId) {
			// ig this is when there are no deployments so it'll just proxy to origin
			return yield* Effect.tryPromise({
				try: () => fetch(env.ORIGIN_URL + url.pathname),
				catch: (err) => new Error(`Failed to proxy to origin: ${String(err)}`)
			});
		}

		const contentType = request.headers.get("RSC") === "1" ? "rsc" : "html"
		const cacheKey = buildCacheKey(cachePrefix, deploymentId, url.pathname, contentType)

		// get cache and stuff later
		const cache = false

		const originResponse = yield* Effect.tryPromise({
			try: () => fetch(env.ORIGIN_URL + url.pathname, {
				headers: request.headers
			}),
			catch: (error) => new Error(`Origin fetch failed: ${error}`)
		})

		// this is basicallyt cache miss and i set it here

		const versionCheck = yield* detectVersionMismatch(
			originResponse,
			env.CACHE_KV,
		);

		if (versionCheck.shouldRevalidate && versionCheck.wantVersion) {
			// this is bg revalidation trigger (no queueing for now cause im broke)
			ctx.waitUntil(
				triggerRevalidation(env, {
					cachePrefix,
					deploymentId,
					originUrl: env.ORIGIN_URL,
					projectId,
					domain: host
				})
			)
		}

		return originResponse;
	})

	return Effect.runPromise(program);
}
