/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * Type contracts for caller-label resolution.
 */

export interface CallerInfo {
	label: string | null;
	tmuxSession: string | null;
	/** Tmux pane_id (e.g. "%7") — used for exact notification routing. */
	tmuxTarget: string | null;
	/** Caller's orchestrator identity from SCALA_ORCH_SESSION_ID — a `tmux:%N` lane id or an attested id. */
	orchestratorSessionId: string | null;
	/** OS PID of the caller (resolved via TCP source port). Stable per Claude Code session for the lifetime of that process. Used to build a unique synthetic session ID when no tmux/orchestrator identity is resolvable. */
	callerPid: number | null;
}
