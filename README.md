# mintlify-cache-sim (all on top of [cloudflare workers](https://developers.cloudflare.com/workers/))

WIP reproduction of [mintlify's edge caching architecture](https://www.mintlify.com/blog/page-speed-improvements) (still WIP and im fixing logical bugs)

a solid write-up on how mintlify uses cloudflare and vercel together got me curious, so i recreated their architecture based on that blog. the mintlify team has been super helpful and this is my take on the same approach with a little bit of ✨ [Effect](https://effect.website/) ✨ magic

pretty cool architecture from their blog:
<img src="https://www.mintlify.com/images/page-speed-improvements-cf-arch.png" alt="pretty cool architecture from their blog" width=900>

took a couple of liberties
- blog approach: cloudflare queues → this repo: durable objects → queues need paid plan & im bork
- blog approach: separate workers → this repo: single worker → simpler as i cant scale to mintlify
- blog approach: cdn cache api w/ cf opts → this repo: caches.default → simpler but still edge cached
- it's not structured and doesnt follow any best practices **for now** as that comes later

live
- proxy: [https://docs.vaishnav.one](https://docs.vaishnav.one) (cf worker)
- origin: [https://nextjs-docs-one-orpin.vercel.app](https://nextjs-docs-one-orpin.vercel.app) (vercel)

## my approach

<img width="518" height="1225" alt="image" src="https://github.com/user-attachments/assets/72f6e82a-3360-4ae9-94d2-db90af684548" />

## constants

| constant | value | source |
|----------|-------|--------|
| cache ttl | 15 days (1296000s) | blog spec |
| lock timeout | 30 minutes (1800000ms) | blog spec |
| batch size | 6 concurrent | cloudflare limit |
| cache key format | `{prefix}/{deploymentId}/{path}:{contentType}` | blog spec |

## kv schema

| key | value | writer |
|-----|-------|--------|
| `CONFIG:{domain}:origin` | vercel url | manual |
| `CONFIG:{domain}:prefix` | cache prefix | manual |
| `DEPLOY:{projectId}:id` | expected version | webhook |
| `DEPLOYMENT:{domain}` | active version | coordinator |

## endpoints

| method | path | purpose | response |
|--------|------|---------|----------|
| GET | `/*` | proxy with caching | page html/rsc |
| POST | `/webhook/deployment` | receive vercel webhook | `{"status":"ok"}` |
| POST | `/prewarm` | warm cache proactively | `{"status":"queued"}` |

## response headers

| header | values | meaning |
|--------|--------|---------|
| `x-cache-status` | `HIT`, `MISS` | cache state |
| `x-vercel-deployment-id` | `dpl_xxx` | origin version |
| `x-vercel-project-id` | `prj_xxx` | project id |



<img width="970" height="662" alt="image" src="https://github.com/user-attachments/assets/e386ee97-60f1-4545-ac75-043ef1aa00b9" />
