// @system codegen
// @status generated
// @edit change the suite in the owned-suites band, then re-run codegen. Hand-edits are overwritten.
//
// This suite's assertions are OWNED by the codegen band: the band module
// carries them verbatim, this file is the emission, and hand edits here are
// overwritten on the next run. The rationale each assertion carries moved
// with it into the band.

import { describe, expect, it } from "bun:test";
import { CALLER_HEADERS } from "@teamscala/os/contracts/mcp";
import type { RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import { buildCallerInfoFromSdk } from "./create-mcp-route.ts";

function requestInfo(headers: Record<string, string>): RequestInfo {
	return { headers };
}

describe("buildCallerInfoFromSdk — X-Organisation-Id forwarding", () => {
	it("carries the database-selected calling agent identity", async () => {
		const info = await buildCallerInfoFromSdk(
			requestInfo({
				[CALLER_HEADERS.ORCHESTRATOR_SESSION]: "orch-session-1",
				[CALLER_HEADERS.AGENT]: "fleet-supervisor",
			}),
		);
		expect(info.agentId).toBe("fleet-supervisor");
	});

	it("carries the caller-supplied org id onto caller-context", async () => {
		const info = await buildCallerInfoFromSdk(
			requestInfo({
				[CALLER_HEADERS.ORCHESTRATOR_SESSION]: "orch-session-1",
				[CALLER_HEADERS.ORGANISATION]: "org-123",
			}),
		);
		expect(info.organisationId).toBe("org-123");
	});

	it("does NOT default the org when the header is absent (no org leak)", async () => {
		// The acceptance invariant: a missing header surfaces as null downstream,
		// where the org-scoped tool REJECTS — never a fallback to any org.
		const info = await buildCallerInfoFromSdk(
			requestInfo({
				[CALLER_HEADERS.ORCHESTRATOR_SESSION]: "orch-session-1",
			}),
		);
		expect(info.organisationId).toBe(null);
	});

	it("carries the org even when only tmux identity is present (no orch session)", async () => {
		const info = await buildCallerInfoFromSdk(
			requestInfo({
				[CALLER_HEADERS.TMUX_TARGET]: "sess:0.1",
				[CALLER_HEADERS.ORGANISATION]: "org-456",
			}),
		);
		expect(info.organisationId).toBe("org-456");
	});

	it("treats an unexpanded template org header as absent (never flows into a write)", async () => {
		// Measured 2026-08-31: a CLI launched without MCP_SYSTEM_ORG_ID in its
		// env sent the literal '${MCP_SYSTEM_ORG_ID}' — which reached a
		// work_items.create as the organisation id. A template the gateway
		// cannot expand is ABSENT, the same doctrine as the session header.
		const info = await buildCallerInfoFromSdk(
			requestInfo({
				[CALLER_HEADERS.ORCHESTRATOR_SESSION]: "orch-session-1",
				[CALLER_HEADERS.ORGANISATION]: "${MCP_SYSTEM_ORG_ID}",
			}),
		);
		expect(info.organisationId).toBe(null);
	});
});
