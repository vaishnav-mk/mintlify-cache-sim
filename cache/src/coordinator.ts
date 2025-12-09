import { DurableObject } from "cloudflare:workers";
import { Effect, pipe } from "effect";
import { LockState } from "./types";
import { REVALIDATION_LOCK_TIMEOUT } from "./constants";

export class RevalidationCoordinator extends DurableObject<Env> {
    async startRevalidation(url: string): Promise<void> {
        const program = Effect.gen(function* (this: RevalidationCoordinator) {
            const existingLock = yield* this.getLock();
            if (existingLock) {
                if (Date.now() - existingLock.timestamp < REVALIDATION_LOCK_TIMEOUT) {
                    return {
                        status: "ALREADY_RUNNING" as const,
                        message: "A revalidation process is already running."
                    }
                }

                yield* this.unlock(); // stale lock after REVALIDATION_LOCK_TIMEOUT, unlock it as there's no way it'll go on forever
            }

        })
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
}