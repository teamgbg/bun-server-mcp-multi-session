/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 * configured-primitives template (per principles/coding-philosophy.md). The
 * mcp-multi-session package never imports @teamscala/logger directly —
 * instead it accepts an InjectedLogger via configure() at boot.
 * Bootloader injection lives in service-runtime per
 * bootloader-injection-contract.
 */

// 1. Locally-defined contract — NEVER import from the upstream package.
export interface InjectedLogger {
	error: (msg: string, ctx?: Record<string, unknown>) => void;
	warn: (msg: string, ctx?: Record<string, unknown>) => void;
	info: (msg: string, ctx?: Record<string, unknown>) => void;
	debug: (msg: string, ctx?: Record<string, unknown>) => void;
}

// 2. Default fallback. No-op so primitives load cleanly when bootloader
//    hasn't called configure() yet (tests, CLI invocations, etc.).
const noopLogger: InjectedLogger = {
	error: () => {},
	warn: () => {},
	info: () => {},
	debug: () => {},
};

export type InjectedFetch = (
	serviceName: string,
	url: string,
	init: RequestInit,
	fallback?: () => Response | Promise<Response>,
) => Promise<Response>;

const noopFetch: InjectedFetch = (_n, url, init) => fetch(url, init);

// 3. Module-level state. The logger keeps the default singleton's identity
//    for the process lifetime (capture invariant,
//    reference/configured-primitives.md): modules capture
//    `const logger = getLogger()` at import time — BEFORE the bootloader
//    calls configure() — so configure() MUTATES it in place, never rebinds
//    it. Value-typed state (_fetch, urls, tokens) rebinds; its getters are
//    called at call sites only, never captured at module scope.
const _logger: InjectedLogger = noopLogger;
let _fetch: InjectedFetch = noopFetch;
let _mcpServerUrl: string | undefined;
let _gatewayToken: string | undefined;

// 4. Bootloader calls this exactly once before any tier-1+ code runs.
export function configure(opts: {
	logger?: InjectedLogger;
	fetch?: InjectedFetch;
	/**
	 * Bearer token for the dev MCP gateway. Injected, never read from the
	 * environment: it is a CREDENTIAL, and `credentials-only-in-secret-rows`
	 * plus `configured-primitives` together mean it reaches this primitive from
	 * its secret row via the bootloader, not from ambient process state.
	 */
	gatewayToken?: string;
}): void {
	if (opts.logger) Object.assign(_logger, opts.logger);
	if (opts.fetch) _fetch = opts.fetch;
	if (opts.mcpServerUrl !== undefined) _mcpServerUrl = opts.mcpServerUrl;
	if (opts.gatewayToken !== undefined) _gatewayToken = opts.gatewayToken;
}

// 5. Internal getters — ALL mcp-multi-session call sites use these.
export function getLogger(): InjectedLogger {
	return _logger;
}

export function getMcpServerUrl(): string | undefined {
	return _mcpServerUrl;
}

/**
 * Bearer token for the dev MCP gateway (bootloader-injected).
 *
 * Undefined when uninjected, which the callers send as an unauthenticated
 * request — the gateway rejects it, and a 401 naming the missing injection is
 * a far better failure than a token silently sourced from ambient process
 * state that no audit of the registry can see.
 */
export function getGatewayToken(): string | undefined {
	return _gatewayToken;
}

export function resilientFetch(
	serviceName: string,
	url: string,
	init: RequestInit,
	fallback?: () => Response | Promise<Response>,
): Promise<Response> {
	return _fetch(serviceName, url, init, fallback);
}
