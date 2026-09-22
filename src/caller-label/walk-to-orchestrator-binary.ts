/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * Walks the process tree from `startPid` upward and returns the first ancestor
 * whose binary basename matches a known orchestrator CLI (claude, codex,
 * gemini, opencode, cursor) — plus the matched binary name. The PID is the
 * *stable* per-session identifier the channel relay also computes on its own
 * side via `process.ppid` — Claude Code spawns short-lived helper processes for
 * HTTP calls whose PIDs change per request, so resolving "the caller" to the
 * helper PID makes notification routing keys unstable. Walking up to the
 * orchestrator binary gives a PID that lives for the whole CLI session. The
 * binary name lets the caller distinguish the opencode shared-server case
 * (fleet lanes that structurally cannot carry a per-pane SCALA_ORCH_SESSION_ID)
 * from claude/codex/gemini/cursor panes that always do.
 * Returns null if no orchestrator ancestor is found (caller is not a
 * recognized CLI — e.g. curl, internal background task).
 */

import { readProcess } from "@teamscala/proc-walker/walk";

const ORCHESTRATOR_BINARY_BASENAMES = new Set([
	"claude",
	"codex",
	"opencode",
	"cursor",
]);

export interface OrchestratorMatch {
	pid: number;
	binary: string;
}

export async function walkToOrchestratorBinary(
	startPid: number,
): Promise<OrchestratorMatch | null> {
	let pid = startPid;
	const visited = new Set<number>();
	while (pid > 1 && !visited.has(pid)) {
		visited.add(pid);
		const record = await readProcess(pid);
		if (!record) break;
		if (record.exe) {
			const base = record.exe.split("/").pop() ?? "";
			if (ORCHESTRATOR_BINARY_BASENAMES.has(base))
				return { pid, binary: base };
		}
		if (record.ppid === pid) break;
		pid = record.ppid;
	}
	return null;
}
