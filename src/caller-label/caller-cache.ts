/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 * Per-port cache for resolved CallerInfo. Without it, every MCP gateway
 * request paid ~75–100ms for two synchronous `execSync` shell-outs
 * (`ss -tnp` and `tmux list-panes`) plus a /proc walk — observable as
 * the dominant gateway latency under load. The caller PID is stable for
 * the lifetime of an HTTP keep-alive connection (and beyond, since ports
 * rarely recycle within the TTL window).
 */

import { ManagedCache } from "@teamscala/cache/cache";
import type { CallerInfo } from "./types.ts";

export const CACHE_TTL_MS = 60_000;
export const CACHE_MAX_ENTRIES = 4096;

export const callerCache = new ManagedCache<CallerInfo>("caller-label", {
	ttlMs: CACHE_TTL_MS,
	maxSize: CACHE_MAX_ENTRIES,
});
