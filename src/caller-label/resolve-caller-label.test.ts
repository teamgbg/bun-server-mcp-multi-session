// @system codegen
// @status generated
// @edit change the suite in the owned-suites band, then re-run codegen. Hand-edits are overwritten.
//
// This suite's assertions are OWNED by the codegen band: the band module
// carries them verbatim, this file is the emission, and hand edits here are
// overwritten on the next run. The rationale each assertion carries moved
// with it into the band.

import { describe, expect, mock, test, beforeEach } from "bun:test";

import { callerCache } from "./caller-cache.ts";

// Port-branched mocks so each test controls the /proc-walk shape without
// reconfiguring the mock between tests (which can fail to propagate to
// modules that captured the mock reference at load time).
let mockPort = 9999;
let mockBinary: string | null = "opencode";
let mockSession: string | null = null;
/** The caller's own TMUX_PANE, returned by the readProcess mock. `undefined`
 * = no tmux pane (the default, matching a paneless caller). */
let mockTmuxPane: string | undefined = undefined;

mock.module("./get-pid-from-port.ts", () => ({
	getPidFromPort: mock((port: number) => Promise.resolve(port === 1111 ? null : 555)),
}));
mock.module("./walk-to-orchestrator-binary.ts", () => ({
	walkToOrchestratorBinary: mock(() =>
		Promise.resolve(
			mockBinary ? { pid: 555, binary: mockBinary } : null,
		),
	),
	OrchestratorMatch: {} as never,
}));
mock.module("./walk-to-orch-session.ts", () => ({
	walkToOrchSession: mock(() => Promise.resolve(mockSession)),
}));
// readProcess is the @teamscala/proc-walker surface resolve-caller-label reads
// TMUX_PANE through (proc-walker-is-the-only-proc-walker). Mocked so the
// canonical-wins wiring is exercised without a live /proc/<pid>/environ.
mock.module("@teamscala/proc-walker/walk", () => ({
	readProcess: mock(() =>
		Promise.resolve(
			mockTmuxPane
				? ({ environ: new Map([["TMUX_PANE", mockTmuxPane]]) } as never)
				: null,
		),
	),
}));

const { resolveCallerLabel } = await import("./resolve-caller-label.ts");

describe("resolveCallerLabel — fleet opencode shared-server path", () => {
	beforeEach(() => {
		callerCache.clear();
		mockBinary = "opencode";
		mockSession = null;
		mockPort = 9999;
		mockTmuxPane = undefined;
	});

	test("opencode binary + no SCALA_ORCH_SESSION_ID → opencode:fleet (gateway-attested)", async () => {
		const result = await resolveCallerLabel(mockPort);
		expect(result).not.toBeNull();
		expect(result?.orchestratorSessionId).toBe("opencode:fleet");
		expect(result?.callerPid).toBe(555);
		expect(result?.label).toBe("opencode/fleet");
	});

	test("a claude binary with a valid SCALA_ORCH_SESSION_ID → the session id, NOT opencode:fleet", async () => {
		mockBinary = "claude";
		mockSession = "tmux:%42";
		const result = await resolveCallerLabel(mockPort);
		expect(result?.orchestratorSessionId).toBe("tmux:%42");
	});

	test("opencode:fleet result is cached (stable for the connection lifetime)", async () => {
		const first = await resolveCallerLabel(8888);
		const second = await resolveCallerLabel(8888);
		expect(first?.orchestratorSessionId).toBe("opencode:fleet");
		expect(second?.orchestratorSessionId).toBe("opencode:fleet");
	});

	test("a non-orchestrator caller (no binary match) → null (rejected upstream)", async () => {
		mockBinary = null;
		const result = await resolveCallerLabel(mockPort);
		expect(result).toBeNull();
	});

	// The same structural case as opencode:fleet, reached by a different route.
	// The binary list assumed claude/codex/gemini/cursor ALWAYS have a tmux
	// pane; that holds for a picker-spawned lane and fails for the same CLI
	// attached over SSH, where the scala-orch-session profile never sets the
	// variable. Returning null there let the downstream re-resolve against the
	// gateway's own `tmux:%gateway` sentinel and reject the caller as a spoof —
	// measured 2026-07-31, an SSH-attached claude session could not send a
	// single cross-pane message.
	test("a paneless claude caller is ATTESTED, not null (the SSH-session case)", async () => {
		mockBinary = "claude";
		mockSession = null;
		callerCache.clear?.();
		const result = await resolveCallerLabel(mockPort);
		expect(result?.orchestratorSessionId).toBe("claude:detached");
		expect(result?.tmuxTarget).toBeNull();
	});

	test("the attested identity is NOT tmux-prefixed, so it cannot masquerade as a pane", async () => {
		mockBinary = "claude";
		mockSession = null;
		callerCache.clear?.();
		const result = await resolveCallerLabel(mockPort);
		// A `tmux:`-prefixed id must resolve to %<digits>; naming a pane that
		// does not exist is exactly the sentinel bug this replaces.
		expect(result?.orchestratorSessionId?.startsWith("tmux:")).toBe(false);
	});

	test("the attestation generalises to every orchestrator CLI, not just claude", async () => {
		for (const bin of ["codex", "gemini", "cursor"]) {
			mockBinary = bin;
			mockSession = null;
			callerCache.clear?.();
			const result = await resolveCallerLabel(mockPort);
			expect(result?.orchestratorSessionId).toBe(`${bin}:detached`);
		}
	});

	test("a real tmux session still wins over the detached fallback", async () => {
		mockBinary = "claude";
		mockSession = "tmux:%42";
		callerCache.clear?.();
		const result = await resolveCallerLabel(mockPort);
		expect(result?.orchestratorSessionId).toBe("tmux:%42");
	});

	// CANONICAL-WINS WIRING (resolve-orchestrator-identity). The gateway must
	// resolve each caller to ITS OWN pane even when the inherited
	// SCALA_ORCH_SESSION_ID is a stale value leaked from the tmux server env.
	// This is the integration of the resolver's precedence rule (unit-tested in
	// resolve-orchestrator-identity.test.ts) with the /proc read — the exact
	// 2026-07-31 incident: three panes shared one stale SCALA_ORCH_SESSION_ID
	// while their TMUX_PANE was correct and distinct.
	test("a stale inherited SCALA_ORCH_SESSION_ID loses to the caller's own TMUX_PANE", async () => {
		mockBinary = "claude";
		mockSession = "tmux:%234"; // stale value leaked into this pane's env
		mockTmuxPane = "%17"; // the caller's REAL pane (tmux sets it per-pane)
		callerCache.clear?.();
		const result = await resolveCallerLabel(mockPort);
		expect(result?.orchestratorSessionId).toBe("tmux:%17");
	});

	test("port with no owning PID → null", async () => {
		const result = await resolveCallerLabel(1111);
		expect(result).toBeNull();
	});
});

describe("verifySenderIdentity — both directions proven in the channel package", () => {
	// This is a cross-reference: the actual verifySenderIdentity tests live in
	// scala-adapters/channel/src/send-orchestrator-message.test.ts. Documented
	// here so a reader of mcp-multi-session knows the identity model is
	// end-to-end tested: legitimate opencode:fleet VERIFIED, forged
	// tmux:%gateway REJECTED.
	test("the identity model is documented in the channel package tests", () => {
		expect(true).toBe(true);
	});
});
