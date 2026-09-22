// @system codegen
// @status generated
// @edit change the suite in the owned-suites band, then re-run codegen. Hand-edits are overwritten.
//
// This suite's assertions are OWNED by the codegen band: the band module
// carries them verbatim, this file is the emission, and hand edits here are
// overwritten on the next run. The rationale each assertion carries moved
// with it into the band.

import { describe, expect, mock, test } from "bun:test";

import { resolveOrchestratorIdentity } from "./resolve-orchestrator-identity.ts";

describe("resolveOrchestratorIdentity — DERIVATION (identity derived from pane, never inherited)", () => {
	test("TMUX_PANE present → identity is tmux:<pane>, derived from the pane id", () => {
		// A pane's identity is a fact ABOUT that pane. TMUX_PANE is set per-pane
		// by tmux, so it is the derivation. The inherited value is ignored.
		expect(resolveOrchestratorIdentity("%17", "tmux:%234")).toBe("tmux:%17");
		expect(resolveOrchestratorIdentity("%152", undefined)).toBe("tmux:%152");
	});

	test("three distinct panes derive three distinct identities even when they share one inherited value", () => {
		// The exact incident shape: %152, %150, %17 all inherited tmux:%234.
		// Each must still resolve to ITS OWN pane, not the shared stale one.
		expect(resolveOrchestratorIdentity("%152", "tmux:%234")).toBe("tmux:%152");
		expect(resolveOrchestratorIdentity("%150", "tmux:%234")).toBe("tmux:%150");
		expect(resolveOrchestratorIdentity("%17", "tmux:%234")).toBe("tmux:%17");
	});

	test("whitespace around TMUX_PANE is tolerated", () => {
		expect(resolveOrchestratorIdentity("  %42  ", "tmux:%42")).toBe("tmux:%42");
	});

	test("a non-pane TMUX_PANE value (not %<digits>) does not derive a tmux identity", () => {
		// Empty / malformed → not a tmux process; fall through to the inherited
		// value rather than minting a wrong identity.
		expect(resolveOrchestratorIdentity("", "tmux:%234")).toBe("tmux:%234");
		expect(resolveOrchestratorIdentity(null, "tmux:%234")).toBe("tmux:%234");
		expect(resolveOrchestratorIdentity(undefined, "abc-uuid")).toBe("abc-uuid");
		expect(resolveOrchestratorIdentity("not-a-pane", "abc-uuid")).toBe("abc-uuid");
	});
});

describe("resolveOrchestratorIdentity — PRECEDENCE (canonical wins, contradicting inherited REPORTED)", () => {
	test("TMUX_PANE wins over a contradicting SCALA_ORCH_SESSION_ID, and the inherited value is REPORTED", () => {
		const reported: string[] = [];
		const result = resolveOrchestratorIdentity("%17", "tmux:%234", (m) =>
			reported.push(m),
		);
		// Canonical wins — the stale inherited value is never obeyed.
		expect(result).toBe("tmux:%17");
		// And it is reported — a silent override is the failure mode this closes.
		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain("tmux:%234");
		expect(reported[0]).toContain("tmux:%17");
		expect(reported[0]).toContain("TMUX_PANE");
	});

	test("no contradiction when TMUX_PANE and SCALA_ORCH_SESSION_ID agree → no report", () => {
		const reported: string[] = [];
		const result = resolveOrchestratorIdentity("%17", "tmux:%17", (m) =>
			reported.push(m),
		);
		expect(result).toBe("tmux:%17");
		expect(reported).toHaveLength(0);
	});

	test("no inherited value → no report (nothing contradicts the canonical pane)", () => {
		const reported: string[] = [];
		expect(resolveOrchestratorIdentity("%17", undefined, (m) => reported.push(m))).toBe(
			"tmux:%17",
		);
		expect(reported).toHaveLength(0);
	});

	test("reporting never throws (a stale identity is not a crash)", () => {
		// A throwing reporter must not escape — the same property
		// resolveDatabaseUrl's reporting holds.
		let threw = false;
		try {
			expect(
				resolveOrchestratorIdentity("%17", "tmux:%234", () => {
					throw new Error("reporter broke");
				}),
			).toBe("tmux:%17");
		} catch {
			threw = true;
		}
		expect(threw).toBe(false);
	});

	test("non-tmux process: inherited SCALA_ORCH_SESSION_ID is trusted (dashboard UUID / attested id)", () => {
		// The leak only produces tmux:%N values; without TMUX_PANE the inherited
		// value is the only signal and is correct for a non-tmux caller.
		expect(resolveOrchestratorIdentity(null, "019fa90b-aaaa-bbbb-cccc-dddddddddddd")).toBe(
			"019fa90b-aaaa-bbbb-cccc-dddddddddddd",
		);
		expect(resolveOrchestratorIdentity(undefined, "opencode:fleet")).toBe("opencode:fleet");
	});

	test("neither source present → null (honestly unattributed, never a fabricated id)", () => {
		expect(resolveOrchestratorIdentity(null, null)).toBeNull();
		expect(resolveOrchestratorIdentity(undefined, undefined)).toBeNull();
		expect(resolveOrchestratorIdentity("", "")).toBeNull();
	});
});

// `mock` is imported for parity with the sibling test files; the resolver is
// pure so no module mocking is needed. Keep the import so a future dependency
// does not silently drop the harness.
void mock;
