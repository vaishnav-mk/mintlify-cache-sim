import { Effect, Cache as EffectCache } from "effect"
import type { ContentType } from "../types"
import { buildCacheKey } from "../utils"

// this is pretty much just worker cache with fancy effect wrappers
export const getCachedResponse = (
  cacheKey: string
): Effect.Effect<Response | null, Error> =>
  Effect.tryPromise({
    try: async () => {
      const cached = await caches.default.match(
        new Request(`https://cache/${cacheKey}`)
      )
      return cached ?? null
    },
    catch: (error) => new Error(`Cache read failed: ${error}`)
  })

export const setCachedResponse = (
  cacheKey: string,
  response: Response
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      await caches.default.put(
        new Request(`https://cache/${cacheKey}`),
        response.clone()
      )
    },
    catch: (error) => new Error(`Cache write failed: ${error}`)
  })

export const warmPath = (
  originUrl: string,
  path: string,
  deploymentId: string,
  cachePrefix: string
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const contentTypes: Array<ContentType> = ["html", "rsc"]
    
    yield* Effect.all(
      contentTypes.map(contentType =>
        Effect.gen(function* () {
          const cacheKey = buildCacheKey(cachePrefix, deploymentId, path, contentType)
          const headers: Record<string, string> = contentType === "rsc" ? { "RSC": "1" } : {}
          
          const response = yield* Effect.tryPromise({
            try: () => fetch(originUrl + path, { headers }),
            catch: (error) => new Error(`Fetch failed for ${path}: ${error}`)
          })
          
          yield* setCachedResponse(cacheKey, response)
        })
      ),
      { concurrency: 2 }
    )
  })