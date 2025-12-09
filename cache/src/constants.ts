export const REVALIDATION_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes
export const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const BATCH_SIZE = 6; // cf concurrent connection limits refer: https://www.mintlify.com/blog/page-speed-improvements#4-revalidation-worker