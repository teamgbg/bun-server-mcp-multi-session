/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Retrieves the MCP_SERVER_URL environment variable for establishing connections
 * to the mcp-ai-chat-system AI tool server. Throws if not configured.
 */

import { requireEnv } from "./require-env.ts";

function getMcpServerUrl(): string {
	return requireEnv("MCP_SERVER_URL");
}

export { getMcpServerUrl };
