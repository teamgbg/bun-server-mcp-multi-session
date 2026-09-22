/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Shared TypeScript options interface for MCP client calls, including timeout,
 * streaming mode, and custom header overrides. Consumed by both raw and JSON
 * MCP client implementations in this directory.
 */

export interface McpClientOptions {
	timeout?: number;
	stream?: boolean;
	headers?: Record<string, string>;
}
