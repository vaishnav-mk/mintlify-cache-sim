import { Effect, pipe } from "effect";
import type { ContentType } from "./types";

export function buildCacheKey(
    prefix: string,
    deploymentId: string,
    path: string,
    contentType: ContentType
): string {
    // Blog examples: acme/dpl_abc123/getting-started:html, acme/dpl_abc123/getting-started:rsc
    return `${prefix}/${deploymentId}${path}:${contentType}`;
}

export function chunks<T>(array: Array<T>, size: number): Array<Array<T>> {
    const result: Array<Array<T>> = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}