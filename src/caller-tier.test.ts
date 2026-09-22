// @system codegen
// @status generated
// @edit change the suite in the owned-suites band, then re-run codegen. Hand-edits are overwritten.
//
// This suite's assertions are OWNED by the codegen band: the band module
// carries them verbatim, this file is the emission, and hand edits here are
// overwritten on the next run. The rationale each assertion carries moved
// with it into the band.

import { describe, expect, mock, test } from "bun:test";
import { runWithCallerContext } from "./caller-context.ts";

// Swappable agent-row shape so each test controls the ai_agents lookup
// without a database: `mockAgentTier` is what the mocked $queryRaw returns;
// null means "no row found" (deleted agent).
let mockAgentTier: string | null | undefined = "org";
let mockQueryCalls = 0;

mock.module("@teamscala/db/database/client", () => ({
	prisma: {
		$queryRaw: mock(() => {
			mockQueryCalls++;
			if (mockAgentTier === null) return Promise.resolve([]);
			return Promise.resolve([{ capability_tier: mockAgentTier ?? null }]);
		}),
	},
}));

// Imported AFTER mock.module so the resolver sees the mocked prisma.
import {
	callerTierDetailFromContext,
	callerTierFromContext,
	GENERATED_TOOL_TIER,
	normalizeCapabilityTier,
	resolveAgentTier,
	resolveCallerCapabilityTier,
	tierRefusedMessage,
	tierSatisfies,
	TIER_RANK,
} from "./caller-tier.ts";

test("tier ranking is contact < org < platform", () => {
	expect(TIER_RANK.contact).toBeLessThan(TIER_RANK.org);
	expect(TIER_RANK.org).toBeLessThan(TIER_RANK.platform);
	expect(GENERATED_TOOL_TIER).toBe("org");
});

describe("tierSatisfies — a caller may use a tool at or below its tier", () => {
	test("platform satisfies everything", () => {
		for (const required of ["contact", "org", "platform"] as const) {
			expect(tierSatisfies("platform", required)).toBe(true);
		}
	});
	test("org satisfies org and contact, not platform", () => {
		expect(tierSatisfies("org", "org")).toBe(true);
		expect(tierSatisfies("org", "contact")).toBe(true);
		expect(tierSatisfies("org", "platform")).toBe(false);
	});
	test("contact satisfies only contact", () => {
		expect(tierSatisfies("contact", "contact")).toBe(true);
		expect(tierSatisfies("contact", "org")).toBe(false);
		expect(tierSatisfies("contact", "platform")).toBe(false);
	});
});

describe("normalizeCapabilityTier — the one fail-closed normalizer", () => {
	test("valid tiers pass through", () => {
		expect(normalizeCapabilityTier("contact")).toBe("contact");
		expect(normalizeCapabilityTier("org")).toBe("org");
		expect(normalizeCapabilityTier("platform")).toBe("platform");
	});

	test("anything else — null, undefined, garbage, casing — is CONTACT", () => {
		expect(normalizeCapabilityTier(null)).toBe("contact");
		expect(normalizeCapabilityTier(undefined)).toBe("contact");
		expect(normalizeCapabilityTier("superuser")).toBe("contact");
		expect(normalizeCapabilityTier("ORG")).toBe("contact");
		expect(normalizeCapabilityTier(42)).toBe("contact");
	});
});

describe("resolveCallerCapabilityTier — fail closed", () => {
	test("no agentId is the CLI/system-caller signature: 'platform', with no DB read", async () => {
		mockQueryCalls = 0;
		expect(await resolveCallerCapabilityTier(null)).toBe("platform");
		expect(await resolveCallerCapabilityTier(undefined)).toBe("platform");
		expect(await resolveCallerCapabilityTier("")).toBe("platform");
		expect(mockQueryCalls).toBe(0);
	});

	test("carries the ai_agents row's declared tier", async () => {
		mockAgentTier = "org";
		expect(await resolveCallerCapabilityTier("agent-1")).toBe("org");
		mockAgentTier = "platform";
		expect(await resolveCallerCapabilityTier("agent-1")).toBe("platform");
		mockAgentTier = "contact";
		expect(await resolveCallerCapabilityTier("agent-1")).toBe("contact");
	});

	test("a missing agent row or undeclared tier is CONTACT — an agent that declares nothing dangerous gets nothing dangerous", async () => {
		mockAgentTier = null;
		expect(await resolveCallerCapabilityTier("deleted-agent")).toBe("contact");
		mockAgentTier = undefined;
		expect(await resolveCallerCapabilityTier("null-tier-agent")).toBe("contact");
		mockAgentTier = "bogus";
		expect(await resolveCallerCapabilityTier("bad-tier-agent")).toBe("contact");
	});
});

describe("resolveAgentTier — identity resolution (id OR slug)", () => {
	// The Fleet Supervisor bug (2026-08-26): the host-command bus stamps the
	// SLUG (gateway-client.with_agent("fleet-supervisor")); the resolver
	// matched only ai_agents.id, so every slug-identified caller failed
	// closed to contact while its row declared platform — 40-minute wedge.
	test("a SLUG-stamped identity resolves to the row's declared tier", async () => {
		mockAgentTier = "platform";
		const result = await resolveAgentTier("fleet-supervisor");
		expect(result.tier).toBe("platform");
		expect(result.resolved).toBe(true);
	});

	test("an ID-stamped identity resolves to the row's declared tier", async () => {
		mockAgentTier = "platform";
		const result = await resolveAgentTier("019ffff3-9e78-79db-95ea-1dbdafcf5110");
		expect(result.tier).toBe("platform");
		expect(result.resolved).toBe(true);
	});

	test("an unresolvable identity returns contact + resolved:false — the FAIL-CLOSED DEFAULT is announced, not mistaken for a declaration", async () => {
		mockAgentTier = null;
		const result = await resolveAgentTier("ghost-agent");
		expect(result.tier).toBe("contact");
		expect(result.resolved).toBe(false);
	});
});

describe("callerTierDetailFromContext — announces the fail-closed default", () => {
	test("a context WITHOUT agentId resolves as the CLI/system-caller signature", async () => {
		mockQueryCalls = 0;
		await runWithCallerContext({}, async () => {
			const detail = await callerTierDetailFromContext();
			expect(detail.agentId).toBeNull();
			expect(detail.tier).toBe("platform");
			expect(detail.resolved).toBe(true);
		});
		expect(mockQueryCalls).toBe(0);
	});

	test("a context WITH a resolved agent carries the agentId and resolved=true", async () => {
		mockAgentTier = "org";
		await runWithCallerContext({ agentId: "fleet-supervisor" }, async () => {
			const detail = await callerTierDetailFromContext();
			expect(detail.agentId).toBe("fleet-supervisor");
			expect(detail.tier).toBe("org");
			expect(detail.resolved).toBe(true);
		});
	});

	test("a context WITH an UNRESOLVED agentId returns contact + resolved:false (the announcement the refusal message needs)", async () => {
		mockAgentTier = null;
		await runWithCallerContext({ agentId: "ghost-agent" }, async () => {
			const detail = await callerTierDetailFromContext();
			expect(detail.agentId).toBe("ghost-agent");
			expect(detail.tier).toBe("contact");
			expect(detail.resolved).toBe(false);
		});
	});
});

describe("tierRefusedMessage — the refusal is part of the contract", () => {
	const message = tierRefusedMessage({
		toolName: "execute_mcp_tool",
		serverName: "scala-mcp",
		required: "platform",
		caller: "contact",
		agentId: "agent-9",
	});

	test("names BOTH tiers — what the caller holds and what the tool requires", () => {
		expect(message).toMatch(/requires capability tier 'platform'/);
		expect(message).toMatch(/holds tier 'contact'/);
	});

	test("names the caller identity and the tool", () => {
		expect(message).toMatch(/agent agent-9/);
		expect(message).toMatch(/"execute_mcp_tool"/);
	});

	test("names the escalation path — raise the ai_agents row, no per-call override", () => {
		expect(message).toMatch(/capability_tier on the agent's ai_agents row/);
		expect(message).toMatch(/no per-call override/);
	});

	test("names the meta-tools so a refused agent learns which verbs are platform", () => {
		expect(message).toMatch(/search_mcp_tools/);
		expect(message).toMatch(/list_mcp_servers/);
	});
});

describe("callerTierFromContext — resolves from the canonical ALS context", () => {
	test("agent callers carry their row tier", async () => {
		mockAgentTier = "org";
		await runWithCallerContext({ agentId: "agent-3" }, async () => {
			expect(await callerTierFromContext()).toBe("org");
		});
	});

	test("context without agentId is 'platform'", async () => {
		mockQueryCalls = 0;
		await runWithCallerContext({}, async () => {
			expect(await callerTierFromContext()).toBe("platform");
		});
		expect(mockQueryCalls).toBe(0);
	});
});
