/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Predicate that checks whether the MCP server URL has been injected
 * via configure(), enabling graceful degradation when mcp-ai-chat-system
 * is unavailable.
 */

import { getMcpServerUrl } from "../configure.ts";

function isMcpConfigured(): boolean {
	return Boolean(getMcpServerUrl()?.trim());
}

export { isMcpConfigured };
