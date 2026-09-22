/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * resolveOrchestratorIdentity — the one precedence rule for a process's
 * orchestrator identity, mirroring scala-tools' `resolveDatabaseUrl`
 * (`scala-tools-core/src/database-url.ts`): the CANONICAL source wins where it
 * exists, and a CONTRADICTING inherited value is REPORTED, never obeyed.
 *
 * CORE PRINCIPLE (operator ruling 2026-07-31): a pane's identity is a fact
 * ABOUT that pane and must be DERIVED from its own pane id, never inherited.
 * An identity that can be inherited can be SHARED, and a shared identity is
 * wrong for every holder but one.
 *
 * The canonical source is `TMUX_PANE`: tmux sets it per-pane when it creates
 * the pane, OVERRIDING any value the tmux server carried, so it can never be
 * shared across panes. The inherited source is `SCALA_ORCH_SESSION_ID`
 * (`ORCHESTRATOR_ENV.SESSION_ID`): correct when the pane's login shell sourced
 * /etc/profile.d/scala-orch-session.sh, STALE otherwise — and there is no way
 * to tell which from the value alone.
 *
 * WHY INHERITED IS UNTRUSTWORTHY HERE. session-picker is a PM2 service, so the
 * tmux server it starts inherits session-picker's whole environment and hands
 * it to every pane. SCALA_ORCH_SESSION_ID is the THIRD instance of that leak
 * (after SERVICE_SLUG, 2026-06-26, and PORT, 2026-07-31): the server carries
 * the orchestrator identity of whatever pane session-picker was launched from,
 * and every pane that never overrode it reports THAT pane's id as its own.
 * Measured 2026-07-31: panes %152, %150 and %17 all carried
 * `SCALA_ORCH_SESSION_ID=tmux:%234` while %234 was not even live — one shared,
 * stale identity across three unrelated panes. TMUX_PANE on the same panes was
 * correct and distinct (%152, %150, %17), because tmux had overridden it.
 *
 * So this is the database-url.ts shape exactly: where TMUX_PANE declares a
 * pane it WINS, and a SCALA_ORCH_SESSION_ID that disagrees is a polluted
 * launcher environment that gets REPORTED, never obeyed. The paired scrub
 * (`scrubTmuxServerIdentityEnv` removing SCALA_ORCH_SESSION_ID from the tmux
 * server env) is what stops the value arriving at all; this is what makes the
 * canonical value authoritative even where a stale inherited copy already sits
 * beside it.
 *
 * This is the RESOLUTION half. It does not read /proc — the caller supplies
 * the two values (TMUX_PANE and SCALA_ORCH_SESSION_ID read from the same
 * process environ) so the precedence rule is pure and fixture-testable, exactly
 * as `resolveDatabaseUrl` takes `readFile`/`fromEnv` by injection.
 */

/** A tmux pane id is `%<digits>` (tmux's own grammar). */
/**
 * Resolve the canonical orchestrator identity for a process.
 *
 * @param tmuxPane       the process's `TMUX_PANE` value (canonical, per-pane).
 *                       `undefined`/null/empty when the process is not in tmux.
 * @param orchSessionId  the process's `SCALA_ORCH_SESSION_ID` value (inherited,
 *                       possibly stale). `undefined`/null when unset.
 * @param report         injected so the contradiction message is testable
 *                       without capturing stderr. No-op by default — a pure
 *                       function reports nothing unless the caller injects a
 *                       channel (the gateway passes `logger.warn`). This keeps
 *                       the resolver free of @teamscala/logger and direct
 *                       logging calls (`single-logger-entry-point`); `resolveDatabaseUrl`'s
 *                       `resolveDatabaseUrl`'s logging default is fine
 *                       because it lives in a CLI package, and this
 *                       primitive cannot use one.
 * @returns the canonical identity: `tmux:%<pane>` when TMUX_PANE is present
 *          (a tmux process); otherwise the inherited SCALA_ORCH_SESSION_ID
 *          (an attested id, or null).
 */

const TMUX_PANE_RE = /^%(\d+)$/;

export function resolveOrchestratorIdentity(
	tmuxPane: string | undefined | null,
	orchSessionId: string | undefined | null,
	report: (message: string) => void = () => {
		/* no-op — see jsdoc above */
	},
): string | null {
	const paneRaw = typeof tmuxPane === "string" ? tmuxPane.trim() : "";
	const m = TMUX_PANE_RE.exec(paneRaw);
	if (m) {
		// TMUX_PANE is canonical: tmux sets it per-pane and overrides any leaked
		// server value, so a process carrying it IS this pane and no other.
		// m[0] is the full `%<digits>` match — keep the `%` so the identity is
		// `tmux:%17`, the grammar every consumer matches against.
		const canonical = `tmux:${m[0]}`;
		const inherited =
			typeof orchSessionId === "string" && orchSessionId.length > 0
				? orchSessionId
				: null;
		if (inherited && inherited !== canonical) {
			// Report every time, matching resolveDatabaseUrl: a silent override
			// trades one invisible identity for another, and the cost here was
			// never the wrong value — it was that nothing anywhere said the two
			// sources disagreed while three panes quietly shared one id. The
			// report is telemetry: it must never convert a stale identity into a
			// crash, so a broken reporter is swallowed.
			try {
				report(
					`ignoring inherited SCALA_ORCH_SESSION_ID=${inherited}: canonical pane identity is ${canonical} (derived from TMUX_PANE). An inherited tmux:%N value on this host is usually a stale leak from the tmux server env, captured from session-picker's supervised environment — see scrubTmuxServerIdentityEnv.`,
				);
			} catch {
				/* a stale identity is not a crash */
			}
		}
		return canonical;
	}
	// No TMUX_PANE — the process is not in a tmux pane (a dashboard caller, an
	// SSH-attached CLI, a fleet shared-server lane). The leak only ever
	// produces `tmux:%N` values, and TMUX_PANE is the guard against those, so
	// the inherited SCALA_ORCH_SESSION_ID is the only signal here and is
	// trustworthy: an attested `opencode:fleet`/`<binary>:detached` id, or
	// legitimately unset.
	return typeof orchSessionId === "string" && orchSessionId.length > 0
		? orchSessionId
		: null;
}
