/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * Stateless MCP HTTP route factory. Builds a caller-info snapshot from
 * incoming request headers and the per-PID override file surface
 * (/tmp/scala-orch-session-${pid}.txt), then runs the MCP handler inside
 * AsyncLocalStorage so downstream code reads a stable identity per request.
 */
/**
 * A header value carrying an env-var template (`${SCALA_ORCH_SESSION_ID}`)
 * is one the CLIENT failed to expand — OpenCode and Codex don't substitute
 * env vars in MCP header values, unlike Claude Code.
 *
 * The gateway MUST NOT expand it server-side: the template names the
 * CLIENT's env var, but `process.env` here is the GATEWAY's environment.
 * The gateway carries its own sentinel `SCALA_ORCH_SESSION_ID=tmux:%gateway`,
 * so server-side expansion mis-attributed EVERY unexpanded caller to
 * `tmux:%gateway` — collapsing all OpenCode/Codex panes to one identity and
 * making per-pane routing (and OpenCode→orchestrator replies) impossible.
 * Incident: 2026-05-29, root-caused from `ackedBy: tmux:%gateway` in
 * event_log.
 *
 * Correct behaviour: an unexpanded-template header is treated as ABSENT.
 * Resolution falls through to the /proc-walk path (resolveCallerLabel),
 * which reads the CALLER's own `/proc/<pid>/environ` for the real
 * SCALA_ORCH_SESSION_ID — the only env that actually belongs to the caller.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	RequestInfo,
	ServerCapabilities,
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { CALLER_HEADERS } from "@teamscala/os/contracts/mcp";
import { createTimer } from "@teamscala/timing/create-timer";
import {
	type CallerInfo,
	callerContextAsyncLocalStorage,
} from "./caller-context.ts";
import { getOrchSessionOverride } from "./caller-label/orch-session-override";
import { resolveCallerLabel } from "./caller-label/resolve-caller-label";

const FORBIDDEN_HOST_ONLY = /^(mcp-client|gemini-cli|codex-cli|shell):[^:]+$/;
const ENV_VAR_TEMPLATE_RE = /\$\{(\w+)\}/;

function isUnexpandedTemplate(value: string): boolean {
	return ENV_VAR_TEMPLATE_RE.test(value);
}

function headerValueOrNull(raw: string | null): string | null {
	if (!raw) return null;
	if (isUnexpandedTemplate(raw)) return null;
	return raw;
}

type McpRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function sdkHeader(requestInfo: RequestInfo | undefined, name: string): string | null {
	const value = requestInfo?.headers[name.toLowerCase()];
	if (Array.isArray(value)) return value[0] ?? null;
	return value ?? null;
}

export async function buildCallerInfoFromSdk(
	requestInfo: RequestInfo | undefined,
): Promise<CallerInfo> {
	const rawOrch = headerValueOrNull(
		sdkHeader(requestInfo, CALLER_HEADERS.ORCHESTRATOR_SESSION),
	);
	const orch =
		rawOrch && !FORBIDDEN_HOST_ONLY.test(rawOrch) ? rawOrch : null;
	const rawTmux = headerValueOrNull(
		sdkHeader(requestInfo, CALLER_HEADERS.TMUX_TARGET),
	);
	const tmux = rawTmux;
	const label = sdkHeader(requestInfo, CALLER_HEADERS.LABEL);
	const session = sdkHeader(requestInfo, CALLER_HEADERS.SESSION);
	const remotePortStr = sdkHeader(requestInfo, CALLER_HEADERS.REMOTE_PORT);
	// Org scope is caller-supplied and only ever FORWARDED downstream — never
	// defaulted. An absent header stays null so the org-scoped tool rejects
	// rather than silently reading some system org. An UNEXPANDED TEMPLATE
	// (${MCP_SYSTEM_ORG_ID} — a CLI whose launch env lacked the variable) is
	// also absent, by the same doctrine as the orchestrator-session header:
	// the gateway cannot expand a client-env placeholder, and a template that
	// flows through becomes a written organisation id (measured 2026-08-31 —
	// a work_items.create carried the literal '${MCP_SYSTEM_ORG_ID}' into the
	// Prisma invocation). Absent stays loud: the write the caller needed
	// refuses naming the missing identity instead of persisting junk.
	const organisationId = headerValueOrNull(
		sdkHeader(requestInfo, CALLER_HEADERS.ORGANISATION),
	);
	// Identity is read on the same terms as org: forwarded, never defaulted. An
	// absent header stays null so the downstream resolves NO user rather than a
	// default one — and it is a CLAIM, not a grant: privilege must come from the
	// stored role, never from this header being present.
	const callerUserId = sdkHeader(requestInfo, CALLER_HEADERS.USER);
	const callerAgentId = sdkHeader(requestInfo, CALLER_HEADERS.AGENT);

	// Authoritative source per `single-notification-source` invariant #2:
	// a CONCRETE x-caller-orchestrator-session header (already expanded by the
	// client, as Claude Code does) is the truth. Unexpanded `${...}` templates
	// were filtered to null above (headerValueOrNull) — they CANNOT be trusted
	// because the gateway has no access to the client's env, only its own. For
	// those callers (OpenCode, Codex) the /proc-walk path below reads the
	// caller's own environ, which is the only correct source.
	if (orch || tmux) {
		const orchestratorId = (orch || tmux) as string;
		const orchestratorType = orch ? "orchestrator_session" : "tmux";
		return {
			label: label || null,
			tmuxSession: session || null,
			tmuxTarget: tmux || null,
			orchestratorSessionId: orch || null,
			callerPid: null,
			orchestratorId,
			orchestratorType,
			organisationId: organisationId || null,
			userId: callerUserId || null,
			agentId: callerAgentId || null,
			rawOrchSession: rawOrch || null,
			rawTmuxTarget: rawTmux || null,
		};
	}

	// Header didn't carry a valid orch; fall through to the /proc-walk path,
	// which throws structurally if the caller's process tree env is also bad.
	// That throw is the fail-loud surface for genuinely-misconfigured callers
	// (no header AND no env) — exactly what `no-shims` prescribes.
	if (remotePortStr) {
		const remotePort = parseInt(remotePortStr, 10);
		if (Number.isFinite(remotePort) && remotePort > 0) {
			const resolved = await resolveCallerLabel(remotePort);
			const override = resolved?.callerPid
				? getOrchSessionOverride(resolved.callerPid)
				: null;
			if (resolved && (resolved.orchestratorSessionId || resolved.tmuxTarget)) {
				const resolvedOrch = override ?? resolved.orchestratorSessionId;
				const orchestratorId = resolvedOrch || resolved.tmuxTarget!;
				const orchestratorType = resolvedOrch ? "orchestrator_session" : "tmux";
				return {
					label: resolved.label || label || null,
					tmuxSession: resolved.tmuxSession || session || null,
					tmuxTarget: resolved.tmuxTarget || null,
					orchestratorSessionId: resolvedOrch || null,
					callerPid: resolved.callerPid || null,
					orchestratorId,
					orchestratorType,
					organisationId: organisationId || null,
					userId: callerUserId || null,
					agentId: callerAgentId || null,
				};
			}
		}
	}

	return {
		label: label || null,
		tmuxSession: session || null,
		tmuxTarget: tmux || null,
		orchestratorSessionId: null,
		callerPid: null,
		orchestratorId: null,
		orchestratorType: null,
		organisationId: organisationId || null,
		userId: callerUserId || null,
		agentId: callerAgentId || null,
	};
}

export type RequestHandlerSchema = unknown;
export type RequestHandler = (
	request: unknown,
	extra: McpRequestExtra,
) => Promise<unknown> | unknown;

export interface McpRouteConfig {
	serverInfo: { name: string; version: string };
	capabilities: ServerCapabilities;
	requestHandlers: Array<{
		schema: RequestHandlerSchema;
		handler: RequestHandler;
	}>;
	/** Called once on the first POST handled by this route. Use for one-shot global wiring. */
	onFirstSession?: () => void | Promise<void>;
	/** Compatibility no-ops in stateless mode (no per-session lifecycle to hook). */
	onSessionInitialized?: (sessionId: string) => void;
	onSessionClosed?: (sessionId: string) => void;
}

export interface McpRouteHandle {
	handle: (request: Request) => Promise<Response>;
	/** Always 0 — stateless. Kept for API compatibility. */
	sessionCount: () => number;
	/** Always []. Kept for API compatibility. */
	sessionIds: () => string[];
	/** No-op in stateless mode. Kept for API compatibility. */
	broadcastToolListChanged: () => Promise<void>;
}

export function createMcpRoute(config: McpRouteConfig): McpRouteHandle {
	let firstFired = false;

	function buildServer(): Server {
		const server = new Server(config.serverInfo, {
			capabilities: config.capabilities,
		});
		// Request metadata belongs to the SDK callback. The adapter derives one
		// platform context from RequestHandlerExtra.requestInfo and enters ALS at
		// the handler boundary; the HTTP route owns no parallel identity parser.
		for (const { schema, handler } of config.requestHandlers) {
			(server.setRequestHandler as (s: unknown, h: RequestHandler) => void)(
				schema,
				async (req, extra) => {
					const callerInfo = await buildCallerInfoFromSdk(extra.requestInfo);
					return callerContextAsyncLocalStorage.run(callerInfo, () =>
						handler(req, extra),
					);
				},
			);
		}
		return server;
	}

	// Latency breakdown via the timing primitive (timing-is-the-only-timing).
	// timeRead/timeAsyncRead keep the start mark local to each measurement,
	// so interleaved requests cannot corrupt each other's durations, and
	// every segment lands in the central registry + OTel emission.
	const totalTimer = createTimer("mcp-multi-session:route-total");
	const segmentTimers = {
		transport: createTimer("mcp-multi-session:new-transport"),
		buildServer: createTimer("mcp-multi-session:build-server"),
		connect: createTimer("mcp-multi-session:server-connect"),
		dispatch: createTimer("mcp-multi-session:dispatch"),
		close: createTimer("mcp-multi-session:close"),
	};

	async function handle(request: Request): Promise<Response> {
		const spans: Array<[string, number]> = [];
		const { result: response, durationMs: totalMs } = await totalTimer.timeAsyncRead(
			async (): Promise<Response> => {
				const method = request.method.toUpperCase();

				if (method === "GET" || method === "DELETE") {
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							error: {
								code: -32000,
								message: "Method not allowed in stateless mode.",
							},
							id: null,
						}),
						{ status: 405, headers: { "content-type": "application/json" } },
					);
				}

				if (!firstFired) {
					firstFired = true;
					await config.onFirstSession?.();
				}

				const { result: transport, durationMs: dTransport } = segmentTimers.transport.timeRead(
					() =>
						new WebStandardStreamableHTTPServerTransport({
							sessionIdGenerator: undefined,
							enableJsonResponse: true,
						}),
				);
				spans.push(["new-transport", dTransport]);

				const { result: server, durationMs: dBuildServer } = segmentTimers.buildServer.timeRead(
					() => buildServer(),
				);
				spans.push(["build-server", dBuildServer]);

				const { durationMs: dConnect } = await segmentTimers.connect.timeAsyncRead(() =>
					server.connect(transport),
				);
				spans.push(["server-connect", dConnect]);

				try {
					// Normalize the Accept header before the SDK's handleRequest: the MCP
					// SDK's StreamableHTTP transport rejects any request whose Accept does
					// not advertise `text/event-stream`, even with `enableJsonResponse`.
					// Claude Code's HTTP MCP client sends only `application/json`, so every
					// CLI tab fails to connect (HTTP 406, surfaced as "token expired").
					// Append `text/event-stream` when the client omitted it. The body MUST
					// be forwarded explicitly with `duplex: "half"` — reconstructing the
					// Request without it leaves the SDK reading an unreadable body and the
					// request hangs to its timeout (the 1.3.131 regression). Auth is
					// unaffected: the Bearer gate above already ran.
					const { result: dispatched, durationMs: dDispatch } =
						await segmentTimers.dispatch.timeAsyncRead(async () => {
							const origAccept = request.headers.get("accept") ?? "";
							let dispatchRequest = request;
							if (!origAccept.includes("text/event-stream") && !origAccept.includes("*/*")) {
								const headers = new Headers(request.headers);
								headers.set("accept", origAccept ? `${origAccept}, text/event-stream` : "text/event-stream");
								dispatchRequest = new Request(request.url, {
									method: request.method,
									headers,
									body: request.body,
									duplex: "half",
								} as RequestInit);
							}
							return transport.handleRequest(dispatchRequest);
						});
					spans.push(["dispatch", dDispatch]);

					const { durationMs: dClose } = await segmentTimers.close.timeAsyncRead(async () => {
						try {
							await transport.close();
						} catch {}
						try {
							await server.close();
						} catch {}
					});
					spans.push(["close", dClose]);

					return dispatched;
				} catch (err) {
					try {
						await transport.close();
					} catch {}
					try {
						await server.close();
					} catch {}
					throw err;
				}
			},
		);

		spans.push(["total", totalMs]);
		const timingHeader = spans
			.map(([k, ms]) => `${k};dur=${ms.toFixed(2)}`)
			.join(", ");
		try {
			response.headers.set("Server-Timing", timingHeader);
		} catch {}
		return response;
	}

	return {
		handle,
		sessionCount: () => 0,
		sessionIds: () => [],
		broadcastToolListChanged: async () => {},
	};
}
