import { DurableObject } from "cloudflare:workers";
import { Effect, pipe } from "effect";
import { DeploymentConfig, LockState, Env } from "./types";
import { BATCH_SIZE, REVALIDATION_LOCK_TIMEOUT } from "./constants";
import { setDeploymentVersion } from "./effects/version";
import { chunks } from "./utils";
import { warmPath } from "./effects/cache";

export class RevalidationCoordinator extends DurableObject<Env> {
    async startRevalidation(config: DeploymentConfig): Promise<{status: string; message: string}> {
        const self = this;
        const program = Effect.gen(function* () {
            const existingLock = yield* self.getLock();
            if (existingLock) {
                if (Date.now() - existingLock.timestamp < REVALIDATION_LOCK_TIMEOUT) {
                    return {
                        status: "ALREADY_RUNNING",
                        message: "A revalidation process is already running."
                    }
                }

                yield* self.unlock(); // stale lock after REVALIDATION_LOCK_TIMEOUT, unlock it as there's no way it'll go on forever
            }

            yield* self.acquireLock(config.deploymentId);

            const paths = yield* self.fetchSitemap(config.originUrl);

            const batches = chunks(paths, BATCH_SIZE);
            let warmedCount = 0;

            for (const batch of batches) {
                yield* Effect.all(
                batch.map(path => warmPath(config.originUrl, path, config.deploymentId, config.cachePrefix)),
                { concurrency: BATCH_SIZE }
                )
                
                warmedCount += batch.length
                
                yield* self.updateLockProgress(config.deploymentId, paths.length, warmedCount)
            }


            // TODO: some fn ill create later to double check version hasnt changed during warming

            yield* setDeploymentVersion(self.env.CACHE_KV, config.domain, config.deploymentId);

            yield* self.unlock();

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
    
    private updateLockProgress(
        deploymentId: string,
        total: number,
        warmed: number
    ): Effect.Effect<void, Error> {
        return Effect.tryPromise({
        try: () => this.ctx.storage.put<LockState>("lock", {
            deploymentId,
            timestamp: Date.now(),
            pathsTotal: total,
            pathsWarmed: warmed
        }),
        catch: (error) => new Error(`Failed to update lock: ${error}`)
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