/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * JSON HTTP client for calling AI tool procedures on mcp-ai-chat-system. Handles
 * auth via SCALA_DEV_KEY bearer token, timeout configuration, and error propagation
 * for synchronous and streaming tool executions.
 */

import { getGatewayToken, resilientFetch } from "../configure.ts";
import { requireEnv } from "./require-env.ts";
import type { McpClientOptions } from "./types.ts";

async function callMcpServer<T = unknown>(
	endpoint: string,
	body: unknown,
	options?: McpClientOptions,
): Promise<T> {
	const serverUrl = requireEnv("MCP_SERVER_URL");
	const url = `${serverUrl}/${endpoint.replace(/^\//, "")}`;

	const response = await resilientFetch("tool-mcp", url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${getGatewayToken() ?? ""}`,
			...options?.headers,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(options?.timeout ?? 30000),
	});

	if (options?.stream) {
		return response as unknown as T;
	}

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`MCP ${endpoint} failed: ${response.status} - ${errorText}`,
		);
	}

	return response.json() as Promise<T>;
}

export { callMcpServer };
