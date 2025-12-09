import { Effect } from "effect";
import type { Env, WebhookRequest } from "../types";

export async function handleDeploymentWebhook(request: Request, env: Env): Promise<Response> {
  const program = Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<WebhookRequest>,
      catch: (error) => new Error(`Invalid webhook body: ${error}`)
    });

    const projectId = body.payload.project.id;
    const deploymentId = body.payload.deployment.id;

    yield* Effect.tryPromise({
      try: () => env.CACHE_KV.put(`DEPLOY:${projectId}:id`, deploymentId),
      catch: (error) => new Error(`Failed to write deployment ID to KV: ${error}`)
    });

    console.log("Webhook: Updated deployment ID for project:", projectId, "to:", deploymentId);

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" }
    });
  });

  return Effect.runPromise(program);
}
