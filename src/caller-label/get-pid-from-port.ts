/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 *
 * Given a TCP source port on localhost, finds the PID that owns the connection
 * by reading /proc/net/tcp{,6} for the socket inode and scanning /proc/<pid>/fd
 * symlinks for that inode. Pure node:fs reads, no subprocess spawn — the
 * previous shell-out to `ss -tnp` cost ~45ms per call (the dominant gateway
 * overhead for callers that don't carry x-caller-orchestrator-session).
 */

import { findPidListeningOnPort } from "@teamscala/proc-walker/socket-peer";

export async function getPidFromPort(port: number): Promise<number | null> {
	return findPidListeningOnPort(port);
}
