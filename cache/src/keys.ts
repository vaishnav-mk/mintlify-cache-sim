// proxy to domain
export const configOriginKey = (domain: string) => `CONFIG:${domain}:origin`;

// domain prefix
export const configPrefixKey = (domain: string) => `CONFIG:${domain}:prefix`;

// proj id for a domain (fallback, prefer origin response header)
export const configProjectKey = (domain: string) => `CONFIG:${domain}:project`;

// expected deployment version for a project (set by Vercel webhook)
export const deployExpectedVersionKey = (projectId: string) =>
  `DEPLOY:${projectId}:id`;

// active deployment version for a domain (set after cache warming completes)
export const deploymentActiveKey = (domain: string) => `DEPLOYMENT:${domain}`;
