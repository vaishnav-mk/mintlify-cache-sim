import { DurableObject } from "cloudflare:workers";
import { Effect, pipe } from "effect";
import { DeploymentConfig, LockState } from "./types";
import { REVALIDATION_LOCK_TIMEOUT } from "./constants";
import { setDeploymentVersion } from "./effects/version";

export class RevalidationCoordinator extends DurableObject<Env> {
    async startRevalidation(config: DeploymentConfig): Promise<{status: string; message: string}> {
        const program = Effect.gen(function* (this: RevalidationCoordinator) {
            const existingLock = yield* this.getLock();
            if (existingLock) {
                if (Date.now() - existingLock.timestamp < REVALIDATION_LOCK_TIMEOUT) {
                    return {
                        status: "ALREADY_RUNNING",
                        message: "A revalidation process is already running."
                    }
                }

                yield* this.unlock(); // stale lock after REVALIDATION_LOCK_TIMEOUT, unlock it as there's no way it'll go on forever
            }

            yield* this.acquireLock(config.deploymentId);

            const paths = yield* this.fetchSitemap(config.originUrl);

            const batches = []; // ill chunk them later
            let warmedCount = 0;

            for (const batch of batches) {
                // warm path
                warmedCount += batch.length;


                // updatelockprogress
            }


            // TODO: some fn ill create later to double check version hasnt changed during warming

            yield* setDeploymentVersion(this.env.CACHE_KV, config.domain, config.deploymentId);

            yield* this.unlock();

            return {
                status: "COMPLETED",
                message: `Revalidation completed. Warmed ${warmedCount} paths.`
            }
        })

        return Effect.runPromise(program);
    }

    private acquireLock(deploymentId: string): Effect.Effect<void, Error> {
        return Effect.tryPromise({
            try: () => this.ctx.storage.put<LockState>("lock", {
                deploymentId,
                timestamp: Date.now(),
                pathsTotal: 0,
                pathsWarmed: 0
            }),
            catch: (error) => new Error(`Failed to acquire lock: ${String(error)}`),
        });
    }

    private getLock(): Effect.Effect<LockState | null, Error> {
        return Effect.tryPromise({
            try: async () => {
                const data = await this.ctx.storage.get<LockState>("lock");
                return data ?? null;
            },
            catch: (error) => new Error(`Failed to get lock state: ${String(error)}`),
        })
    }

    private unlock(): Effect.Effect<void, Error> {
        return Effect.tryPromise({
            try: async () => {
                await this.ctx.storage.delete("lock");
            },
            catch: (error) => new Error(`Failed to unlock: ${String(error)}`),
        });
    }

    private fetchSitemap(originUrl: string): Effect.Effect<Array<string>, Error> {
        return Effect.tryPromise({
            try: async () => {
                // i should make the api call here, will do it later
                const response = ['https://docs.example.com/docs', 'https://docs.example.com/docs/drivers/hamilton'];
                return response
                // will pipe and do retries later
            },
            catch: (error) => new Error(`Failed to fetch sitemap: ${String(error)}`),
        });
    }
}