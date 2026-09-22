/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * caller-context.ts — describe what this file does.
 */
	/**
	 * Caller-supplied user id (X-Caller-User-Id). A CLAIM of identity, never a
	 * grant of privilege: the downstream must look it up and derive authority
	 * from the stored role. Forwarded, never injected, and absent stays absent
	 * so no default identity is ever assumed.
	 *
	 * Without this the gateway resolved every call as the SYSTEM caller, so org
	 * scope was applied by request rather than by authorisation — measured
	 * 2026-08-02, a non-admin and a non-existent user id both read another
	 * organisation's rows.
	 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * AI agent capability tier (ai_agents.capability_tier, migration 748):
 * contact < org < platform. Contact — curated public list only; org —
 * org-scoped generated catalogue; platform — full gateway including
 * downstream federation and the four federation meta-tools.
 *
 * The TYPE (and the tier order it names) lives in @teamscala/os — tier 0, so
 * tier-0 consumers (guard validators, whose module graph is restricted to os
 * by `validator-imports-declared`) compare tiers with the SAME order the
 * gateway enforces; a second copy of the order would drift
 * (`the-severe-bugs-live-at-seams`). This re-export keeps this module's
 * public API unchanged.
 */
// Imported AND re-exported: a bare `export type { X } from` would not bind X
// locally, and this file annotates with it below.
import type { CapabilityTier } from "@teamscala/os/capability-tier";

export type { CapabilityTier };

export interface CallerInfo {
	label: string | null;
	tmuxSession: string | null;
	/** Full tmux target: "session:window.pane" */
	tmuxTarget: string | null;
	/** Caller's orchestrator identity from SCALA_ORCH_SESSION_ID — a `tmux:%N` lane id or an attested id. */
	orchestratorSessionId: string | null;
	/** OS PID of the caller process. Stable per Claude Code session for the lifetime of that process. */
	callerPid: number | null;
	/**
	 * Resolved orchestrator id used as the durable identity for this caller —
	 * the identity durable host-command emissions and caller gates match on.
	 * Resolution order: orchestratorSessionId → tmuxTarget → null (no
	 * synthetic fallback).
	 */
	orchestratorId: string | null;
	/** "orchestrator_session" | "tmux" | "system" */
	orchestratorType: string | null;
	/** Caller's IP address (from X-Forwarded-For or direct socket). */
	ipAddress?: string | null;
	/** Caller's User-Agent string. */
	userAgent?: string | null;
	/**
	 * Caller-supplied organisation id (X-Organisation-Id). The gateway only ever
	 * FORWARDS this to the downstream — it injects nothing — so a null/absent
	 * value is a null downstream, where the org-scoped tool rejects rather than
	 * defaulting. Optional because org scope is populated only on the MCP HTTP
	 * route path (create-mcp-route); the host-command bus paths carry
	 * orchestrator identity, not org, and omit it.
	 */
	organisationId?: string | null;
	userId?: string | null;
	/** Calling ai_agents identity selected by a trusted internal executor. */
	agentId?: string | null;
	/**
	 * The caller's RESOLVED capability tier — never read from a header. Agent
	 * callers carry ai_agents.capability_tier (resolved server-side from
	 * agentId); CLI/system callers are 'platform' (operator-directed CLI lanes).
	 * A client cannot claim a tier: absence of agentId is the CLI signature,
	 * and the tier is derived at the dispatch chokepoint, not forwarded.
	 */
	capabilityTier?: CapabilityTier | null;
	/** Raw X-Caller-Tmux-Target header value as received. */
	rawTmuxTarget?: string | null;
	/** Raw X-Caller-Orchestrator-Session header value as received. */
	rawOrchSession?: string | null;
}

export const callerContextAsyncLocalStorage =
	new AsyncLocalStorage<CallerInfo>();

const EMPTY_CALLER_INFO: CallerInfo = Object.freeze({
	label: null,
	tmuxSession: null,
	tmuxTarget: null,
	orchestratorSessionId: null,
	callerPid: null,
	orchestratorId: null,
	orchestratorType: null,
	ipAddress: null,
	userAgent: null,
	organisationId: null,
	userId: null,
	agentId: null,
	capabilityTier: null,
	rawTmuxTarget: null,
	rawOrchSession: null,
});

/** Returns the active CallerInfo or an all-null shape when no context is set. */
export function getCallerContext(): CallerInfo {
	return callerContextAsyncLocalStorage.getStore() ?? EMPTY_CALLER_INFO;
}

/** Run background work with an explicit caller identity in the canonical ALS. */
export function runWithCallerContext<T>(
	context: Partial<CallerInfo>,
	fn: () => T,
): T {
	return callerContextAsyncLocalStorage.run(
		{ ...EMPTY_CALLER_INFO, ...context },
		fn,
	);
}

export const callerContext = {
	get label() {
		return callerContextAsyncLocalStorage.getStore()?.label || null;
	},
	get tmuxSession() {
		return callerContextAsyncLocalStorage.getStore()?.tmuxSession || null;
	},
	get tmuxTarget() {
		return callerContextAsyncLocalStorage.getStore()?.tmuxTarget || null;
	},
	get orchestratorSessionId() {
		return (
			callerContextAsyncLocalStorage.getStore()?.orchestratorSessionId || null
		);
	},
};
