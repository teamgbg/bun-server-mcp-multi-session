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
import { createMcpRoute } from "./create-mcp-route.ts";
import { getCallerContext } from "./caller-context.ts";

function mcpPost(headers: Record<string, string>, method: string, params: Record<string, unknown>): Request {
	return new Request("http://localhost/mcp", {
		method: "POST",
		headers: new Headers({
			"content-type": "application/json",
			accept: "application/json",
			...headers,
		}),
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
}

describe("createMcpRoute — caller identity propagation through stateless dispatch", () => {
	it("getCallerContext().userId is visible inside a tools/call handler", async () => {
		let seen: string | null | undefined = "__not_invoked__";
		const route = createMcpRoute({
			requestHandlers: [
				{
					method: "tools/call",
					handler: async () => {
						seen = getCallerContext().userId ?? null;
						return { content: [{ type: "text", text: "ok" }] };
					},
				},
			],
		});

		const res = await route.handle(
			mcpPost(
				{
					[CALLER_HEADERS.USER]: "system",
					[CALLER_HEADERS.ORCHESTRATOR_SESSION]: "orch-repro",
					[CALLER_HEADERS.ORGANISATION]: "org-repro",
				},
				"tools/call",
				{ name: "anything", arguments: {} },
			),
		);

		// The handler MUST have been invoked and MUST have seen the system identity.
		expect(seen).not.toBe("__not_invoked__");
		expect(seen).toBe("system");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { result?: unknown; error?: unknown };
		expect(body.error).toBeUndefined();
		expect(body.result).toBeDefined();
	});
});
