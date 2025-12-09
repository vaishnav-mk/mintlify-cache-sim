import { DurableObject } from "cloudflare:workers";
import { Effect, pipe } from "effect";
import { DeploymentConfig, LockState, Env } from "./types";
import { BATCH_SIZE, REVALIDATION_LOCK_TIMEOUT } from "./constants";
import { setDeploymentVersion } from "./effects/version";
import { chunks } from "./utils";
import { warmPath } from "./effects/cache";

export class RevalidationCoordinator extends DurableObject<Env> {
    async startRevalidation(config: DeploymentConfig): Promise<{status: string; message: string}> {
        console.log("[Coordinator] startRevalidation called with config:", JSON.stringify(config));
        const self = this;
        const program = Effect.gen(function* () {
            console.log("[Coordinator] Checking for existing lock...");
            const existingLock = yield* self.getLock();
            console.log("[Coordinator] Existing lock:", existingLock);
            
            if (existingLock) {
                const lockAge = Date.now() - existingLock.timestamp;
                console.log("[Coordinator] Lock exists, age:", lockAge, "ms, timeout:", REVALIDATION_LOCK_TIMEOUT, "ms");
                
                if (lockAge < REVALIDATION_LOCK_TIMEOUT) {
                    console.log("[Coordinator] Lock is still valid, returning ALREADY_RUNNING");
                    return {
                        status: "ALREADY_RUNNING",
                        message: "A revalidation process is already running."
                    }
                }

                console.log("[Coordinator] Lock is stale, unlocking...");
                yield* self.unlock(); // stale lock after REVALIDATION_LOCK_TIMEOUT, unlock it as there's no way it'll go on forever
            }

            console.log("[Coordinator] Acquiring lock for deployment:", config.deploymentId);
            yield* self.acquireLock(config.deploymentId);

            console.log("[Coordinator] Fetching sitemap from:", config.originUrl);
            const paths = yield* self.fetchSitemap(config.originUrl);
            console.log("[Coordinator] Fetched", paths.length, "paths:", paths);

            const batches = chunks(paths, BATCH_SIZE);
            let warmedCount = 0;
            console.log("[Coordinator] Split into", batches.length, "batches of size", BATCH_SIZE);

            for (const batch of batches) {
                console.log("[Coordinator] Warming batch:", batch);
                yield* Effect.all(
                    batch.map(path => warmPath(config.originUrl, path, config.deploymentId, config.cachePrefix)),
                    { concurrency: BATCH_SIZE }
                )
                
                warmedCount += batch.length
                console.log("[Coordinator] Warmed", warmedCount, "/", paths.length, "paths");
                
                yield* self.updateLockProgress(config.deploymentId, paths.length, warmedCount)
            }


            // TODO: some fn ill create later to double check version hasnt changed during warming

            console.log("[Coordinator] Setting deployment version for domain:", config.domain, "deploymentId:", config.deploymentId);
            yield* setDeploymentVersion(self.env.CACHE_KV, config.domain, config.deploymentId);

            console.log("[Coordinator] Unlocking...");
            yield* self.unlock();

            console.log("[Coordinator] Revalidation completed. Warmed", warmedCount, "paths.");
            return {
                status: "COMPLETED",
                message: `Revalidation completed. Warmed ${warmedCount} paths.`
            }
        })

        return Effect.runPromise(program);
    }

    private acquireLock(deploymentId: string): Effect.Effect<void, Error> {
        console.log("[Coordinator] acquireLock() called for deploymentId:", deploymentId);
        return Effect.tryPromise({
            try: () => {
                console.log("[Coordinator] Writing lock to storage...");
                return this.ctx.storage.put<LockState>("lock", {
                    deploymentId,
                    timestamp: Date.now(),
                    pathsTotal: 0,
                    pathsWarmed: 0
                });
            },
            catch: (error) => new Error(`Failed to acquire lock: ${String(error)}`),
        });
    }

    private getLock(): Effect.Effect<LockState | null, Error> {
        console.log("[Coordinator] getLock() called");
        return Effect.tryPromise({
            try: async () => {
                const data = await this.ctx.storage.get<LockState>("lock");
                console.log("[Coordinator] getLock() retrieved:", data);
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
        console.log("[Coordinator] updateLockProgress() called - warmed:", warmed, "/", total);
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
        console.log("[Coordinator] unlock() called");
        return Effect.tryPromise({
            try: async () => {
                console.log("[Coordinator] Deleting lock from storage...");
                await this.ctx.storage.delete("lock");
                console.log("[Coordinator] Lock deleted successfully");
            },
            catch: (error) => new Error(`Failed to unlock: ${String(error)}`),
        });
    }

    private fetchSitemap(originUrl: string): Effect.Effect<Array<string>, Error> {
        console.log("[Coordinator] fetchSitemap() called for originUrl:", originUrl);
        return Effect.tryPromise({
            try: async () => {
                const response = await fetch(`${originUrl}/api/sitemap`)
                const data = await response.json() as { paths: Array<string> }
                console.log("[Coordinator] fetchSitemap() returning mock paths:", data);
                return data.paths
            },
            catch: (error) => new Error(`Failed to fetch sitemap: ${String(error)}`),
        }).pipe(
            Effect.retry({ times: 3 })
        )
    }
}