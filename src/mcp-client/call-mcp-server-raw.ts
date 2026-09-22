/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Low-level HTTP client for raw streaming requests to the mcp-ai-chat-system AI
 * tool server. Bypasses JSON parsing to return the raw Response object for
 * streaming tool execution results back to clients.
 */

import { getGatewayToken, resilientFetch } from "../configure.ts";
import { requireEnv } from "./require-env.ts";
import type { McpClientOptions } from "./types.ts";

async function callMcpServerRaw(
	endpoint: string,
	body: unknown,
	options?: Omit<McpClientOptions, "stream">,
): Promise<Response> {
	const serverUrl = requireEnv("MCP_SERVER_URL");
	const url = `${serverUrl}/${endpoint.replace(/^\//, "")}`;

	return resilientFetch("tool-mcp", url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${getGatewayToken() ?? ""}`,
			...options?.headers,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(options?.timeout ?? 30000),
	});
}

export { callMcpServerRaw };
