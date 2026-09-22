/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 * Walks the process tree looking for an ancestor whose environ contains
 * SCALA_ORCH_SESSION_ID. The launcher and the scala-orch-session shell profile
 * issue this value to every managed CLI: inside tmux it is `tmux:$TMUX_PANE`,
 * the pane-unique orchestrator identity; outside tmux it is unset or an
 * attested id (`opencode:fleet`, `<binary>:detached`). When present, it is
 * the caller's orchestrator identity.
 */

import { ORCHESTRATOR_ENV } from "@teamscala/os/contracts/mcp";
import { readProcess } from "@teamscala/proc-walker/walk";

export async function walkToOrchSession(startPid: number): Promise<string | null> {
	let pid = startPid;
	const visited = new Set<number>();
	while (pid > 1 && !visited.has(pid)) {
		visited.add(pid);
		const record = await readProcess(pid);
		if (!record) break; // process gone mid-walk
		const sessionId = record.environ.get(ORCHESTRATOR_ENV.SESSION_ID);
		if (sessionId) return sessionId;
		if (record.ppid === pid) break;
		pid = record.ppid;
	}
	return null;
}
