import { Effect } from "effect";
import type { Env } from "./types";

// refer: https://www.mintlify.com/blog/page-speed-improvements#2-automatic-version-detection-and-revalidation

export const getExpectedVersion = (kv: KVNamespace, projectId: string): Effect.Effect<string | null, Error> => {
  return Effect.tryPromise({
    try: () => kv.get<string>(`DEPLOY:${projectId}:id`),
    catch: (error) => new Error(`Failed to get expected version: ${String(error)}`),
  });
}

export const setDeploymentVersion = (kv: KVNamespace, domain: string, deploymentId: string): Effect.Effect<void, Error> => {
  return Effect.tryPromise({
    try: () => kv.put(`DEPLOY:${domain}`, deploymentId),
    catch: (error) => new Error(`Failed to set deployment version: ${String(error)}`),
  });
}

export const detectVersionMismatch = (response: Response, kv: KVNamespace): Effect.Effect<{
    shouldRevalidate: boolean;
    wantVersion: string | null;
    gotVersion: string | null;
}, Error> => {
    return Effect.gen(function* () {
        const gotVersion = response.headers.get("x-version");
        const projectId = response.headers.get("x-vercel-project-id");

        if (!projectId || !gotVersion) {
            return {
                shouldRevalidate: false,
                wantVersion: null,
                gotVersion: null
            }
        }

        const wantVersion = yield* getExpectedVersion(kv, projectId);

        if (!wantVersion) {
            return {
                shouldRevalidate: false,
                wantVersion: null,
                gotVersion
            }
        }

        return {
            shouldRevalidate: wantVersion !== null && wantVersion !== gotVersion,
            wantVersion,
            gotVersion
        }
    })
}