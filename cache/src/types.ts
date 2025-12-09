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

export interface PrewarmRequest {
  paths: string[];
  cachePrefix: string;
  deploymentId: string;
  isPrewarm: boolean;
  originUrl: string;
  projectId: string;
  domain: string;
}

export interface WebhookRequest {
  type: string;
  payload: {
    team: { id: string } | null;
    user: { id: string };
    alias: string[];
    deployment: {
      id: string;
      meta: Record<string, string>;
      url: string;
      name: string;
    };
    links: {
      deployment: string;
      project: string;
    };
    target: "production" | "staging" | null;
    project: { id: string };
    plan: string;
    regions: string[];
  };
}
