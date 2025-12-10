import { Effect } from "effect";
import type { Env, WebhookRequest } from "../types";
import { deployExpectedVersionKey } from "../keys";

export async function handleDeploymentWebhook(request: Request, env: Env): Promise<Response> {
  const program = Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<WebhookRequest>,
      catch: (error) => new Error(`Invalid webhook body: ${error}`)
    });

    const projectId = body.payload.project.id;
    const deploymentId = body.payload.deployment.id;
    console.log("Webhook: Received deployment webhook for project:", projectId, "deploymentId:", deploymentId);

    yield* Effect.tryPromise({
      try: () => env.CACHE_KV.put(deployExpectedVersionKey(projectId), deploymentId),
      catch: (error) => new Error(`Failed to write deployment ID to KV: ${error}`)
    });

    console.log("Webhook: Updated deployment ID for project:", projectId, "to:", deploymentId);

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" }
    });
  });

  return Effect.runPromise(program);
}
