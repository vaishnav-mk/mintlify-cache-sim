import { Schema } from "@effect/schema";

export const DeploymentConfig = Schema.Struct({
  cachePrefix: Schema.String,
  deploymentId: Schema.String,
  originUrl: Schema.String,
  projectId: Schema.String,
  domain: Schema.String
});

export type DeploymentConfig = Schema.Schema.Type<typeof DeploymentConfig>;

export const LockState = Schema.Struct({
  deploymentId: Schema.String,
  timestamp: Schema.Number,
  pathsTotal: Schema.Number,
  pathsWarmed: Schema.Number
});

export type LockState = Schema.Schema.Type<typeof LockState>;

export const ContentType = Schema.Literal("html", "rsc");
export type ContentType = Schema.Schema.Type<typeof ContentType>;

export interface Env {
  CACHE_KV: KVNamespace;
  COORDINATOR: DurableObjectNamespace;
  ORIGIN_URL: string;
}
