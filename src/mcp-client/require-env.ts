/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Throws a descriptive error if a required environment variable (MCP_SERVER_URL,
 * SCALA_DEV_KEY) is missing or whitespace-only. Used by all MCP client helpers
 * to fail fast with actionable messages during service initialization.
 */

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} not configured`);
	}
	return value;
}

export { requireEnv };
