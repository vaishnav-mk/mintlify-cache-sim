import { DurableObject } from "cloudflare:workers";
import { Effect, pipe } from "effect";
import { LockState } from "./types";
import { REVALIDATION_LOCK_TIMEOUT } from "./constants";

export class RevalidationCoordinator extends DurableObject<Env> {
    async startRevalidation(url: string): Promise<void> {
        const program = Effect.gen(function* () {
            const existingLock = yield* this.getLock();
            if (existingLock) {
                if (Date.now() - existingLock.timestamp < REVALIDATION_LOCK_TIMEOUT) {
                    return {
                        status: "ALREADY_RUNNING" as const,
                        message: "A revalidation process is already running."
                    }
                }
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
}