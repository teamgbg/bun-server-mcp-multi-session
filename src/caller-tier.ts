/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * The capability-tier comparison core (migration 748), one tier below BOTH
 * dispatch surfaces — federation (mcp-client-pool) and direct tools/call
 * (mcp-tool-runtime) — so the identical comparison applies on every path.
 */

import { prisma } from "@teamscala/db/database/client";
import { getCallerContext, type CapabilityTier } from "./caller-context.ts";
import { normalizeCapabilityTier } from "@teamscala/os/capability-tier";

// The pure tier core (order, comparison, fail-closed normalization) is
// SINGLE-SOURCED in @teamscala/os — tier 0, so guard validators (whose
// module graph is restricted to os by `validator-imports-declared`) compare
// tiers with the SAME code the gateway enforces. These re-exports keep this
// module's public API for its dispatch-surface consumers.
export {
	GENERATED_TOOL_TIER,
	normalizeCapabilityTier,
	TIER_RANK,
	tierSatisfies,
} from "@teamscala/os/capability-tier";

/**
 * The refusal is part of the contract: it names BOTH tiers (what the caller
 * holds, what the tool requires) and the escalation path — never a bare
 * forbid. The escalation is raising the agent's DECLARED tier on its
 * ai_agents row (the operator's registry surface); there is deliberately no
 * per-call override, and UNRECOVERABLE verbs escalate to the operator
 * instead of to a higher tier.
 */
export function tierRefusedMessage(input: {
	toolName: string;
	serverName: string;
	required: CapabilityTier;
	caller: CapabilityTier;
	agentId?: string | null;
	/** True when NO ai_agents row resolved for agentId — the contact tier is the fail-closed default, not a declaration. */
	unresolved?: boolean;
}): string {
	const who = input.agentId
		? ` (agent ${input.agentId})`
		: " (CLI/system caller)";
	const unresolvedNote = input.unresolved
		? ` NO ai_agents row resolves for agent '${input.agentId}' — the contact tier is the FAIL-CLOSED DEFAULT, not a declaration: the identity is misspelled or the row is gone. Check the agent's slug/id. `
		: " ";
	return (
		`REFUSED: tool "${input.toolName}" on server "${input.serverName}" requires capability tier '${input.required}' ` +
		`but this caller holds tier '${input.caller}'${who}.${unresolvedNote}` +
		`Tiers are contact < org < platform: 'org' covers row-sourced and generated catalogue tools, ` +
		`and the four federation meta-tools (search_mcp_tools, get_tool_schema, execute_mcp_tool, list_mcp_servers) ` +
		`are 'platform' verbs — a tier below 'platform' cannot federate through the gateway at all. ` +
		`There is no per-call override: if this reach is intended, raise capability_tier on the agent's ai_agents row ` +
		`(registry edit — the operator's surface); UNRECOVERABLE verbs (raw DDL, destructive registry ops, deploy/push, spend) ` +
		`stay off every agent menu and escalate to the operator instead.`
	);
}

/**
 * Fail-closed tier normalization has ONE home (@teamscala/os/capability-tier;
 * re-exported above) — the local copy was deleted when the core moved to tier
 * 0 so the fail-closed default cannot drift per surface.
 */

/**
 * Resolves an agent identity against ai_agents by id OR slug, returning the
 * declared tier + resolution status. Fail-closed contact when no row
 * resolves — measured 2026-08-26 Fleet Supervisor monitor wedge: the
 * host-command bus stamps the SLUG (gateway-client.with_agent), the prior
 * resolver matched only id, so every slug-identified caller held 'contact'
 * while its row declared 'platform' for 40 minutes.
 */
export interface ResolvedCallerTier {
	tier: CapabilityTier;
	/** False when NO ai_agents row resolves for the identity — the fail-closed contact default applied. */
	resolved: boolean;
}

export async function resolveAgentTier(
	agentId: string,
): Promise<ResolvedCallerTier> {
	const rows = await prisma.$queryRaw<
		Array<{ capability_tier: string | null }>
	>`SELECT capability_tier FROM ai_agents WHERE id = ${agentId} OR slug = ${agentId} LIMIT 1`;
	if (rows.length === 0) {
		return { tier: "contact", resolved: false };
	}
	return {
		tier: normalizeCapabilityTier(rows[0]?.capability_tier),
		resolved: true,
	};
}

export async function resolveCallerCapabilityTier(
	agentId: string | null | undefined,
): Promise<CapabilityTier> {
	if (!agentId) return "platform";
	return (await resolveAgentTier(agentId)).tier;
}

/** The current request's caller tier, resolved from the canonical ALS context. */
export async function callerTierFromContext(): Promise<CapabilityTier> {
	return resolveCallerCapabilityTier(getCallerContext().agentId);
}

/**
 * The current request's caller tier WITH resolution status, for refusal
 * messages that must ANNOUNCE the fail-closed default rather than let a
 * mis-identified caller read 'contact' as a real declaration.
 */
export async function callerTierDetailFromContext(): Promise<ResolvedCallerTier & {
	agentId: string | null;
}> {
	const agentId = getCallerContext().agentId ?? null;
	if (!agentId) return { tier: "platform", resolved: true, agentId: null };
	return { ...(await resolveAgentTier(agentId)), agentId };
}
