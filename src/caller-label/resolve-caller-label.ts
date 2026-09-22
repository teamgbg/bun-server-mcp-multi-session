/**
 * @system mcp-multi-session
 * @status handwritten
 * @edit edit directly
 */

		// Any OTHER orchestrator CLI with no SCALA_ORCH_SESSION_ID — the same structural case as the opencode branch above, reached by a different
		// route. The binary list treats claude/codex/gemini/cursor as CLIs that "always" have a tmux pane, which is true of a picker-spawned lane and
		// FALSE of the same CLI attached over SSH: the scala-orch-session profile only sets the variable inside tmux, so a bare SSH session has
		// no pane and no id.
		//
		// Returning null there is not a safe default. It forwards no header, so the downstream re-resolves against the GATEWAY's own env and sees the
		// `tmux:%gateway` sentinel — an identity that claims to be a tmux pane and is not, which `verifySenderIdentity` correctly rejects as the
		// spoof signature. The caller is then told its origin cannot be established, when the truth is simply that it has no pane. Measured
		// 2026-07-31: an SSH-attached claude session could not send a single cross-pane message, and the only other route (raw `tmux send-keys`)
		// is guard-blocked, so the lane had no sanctioned way to reach a peer.
		//
		// Attesting the class is strictly MORE honest than the sentinel: the binary comes from a /proc walk of the caller's real process tree, so
		// it is unforgeable by the caller exactly as `opencode:fleet` is, and it says what is true — an attested CLI with no pane — instead of naming a
		// pane that does not exist. It does not loosen the tmux check: a `tmux:`-prefixed identity still must resolve to `%<digits>`.

import { getAppLogger } from "@teamscala/logger/app-loggers";
import { getLogger } from "../configure.ts";
import { callerCache } from "./caller-cache.ts";
import { getPidFromPort } from "./get-pid-from-port.ts";
import type { CallerInfo } from "./types.ts";
import { walkToOrchSession } from "./walk-to-orch-session.ts";
import { walkToOrchestratorBinary } from "./walk-to-orchestrator-binary.ts";
import { resolveOrchestratorIdentity } from "./resolve-orchestrator-identity.ts";
import { readProcess } from "@teamscala/proc-walker/walk";

const logger = getLogger();

export async function resolveCallerLabel(
	remotePort: number,
): Promise<CallerInfo | null> {
	const cached = callerCache.get(remotePort);
	if (cached !== undefined) return cached;

	const info = await resolveCallerLabelUncached(remotePort);
	if (info) callerCache.set(remotePort, info);
	return info;
}

async function resolveCallerLabelUncached(
	remotePort: number,
): Promise<CallerInfo | null> {
	try {
		const immediatePid = await getPidFromPort(remotePort);
		if (!immediatePid) {
			getAppLogger().warn(
				`[mcp-multi-session] Could not find PID for source port ${remotePort}. ` +
					`The caller's TCP connection could not be mapped to a process.`,
			);
			return null;
		}
		const match = await walkToOrchestratorBinary(immediatePid);
		const pid = match?.pid ?? immediatePid;
		const binary = match?.binary ?? null;
		const FORBIDDEN_HOST_ONLY =
			/^(mcp-client|gemini-cli|codex-cli|shell):[^:]+$/;
		const orchSession = await walkToOrchSession(pid);
		// CANONICAL PANE IDENTITY (`resolve-orchestrator-identity`). TMUX_PANE is the canonical source — tmux sets it per-pane, overriding any leaked
		// server value — so where it is present it WINS over a (possibly stale, leaked) SCALA_ORCH_SESSION_ID, and a contradiction is REPORTED never
		// obeyed. This is the database-url.ts shape applied to identity, paired with `scrubTmuxServerIdentityEnv` (which stops the stale value
		// arriving at all). Read here, not inside walkToOrchSession, so the walker stays focused on SCALA_ORCH_SESSION_ID and the precedence rule
		// stays pure + unit-tested.
		//
		// A process with TMUX_PANE is a real tmux lane, so this resolves it to
		// `tmux:%<pane>` even when SCALA_ORCH_SESSION_ID is unset (e.g. a
		// non-POSIX shell that never sourced /etc/profile.d) — closing the path
		// where a scrubbed server env left a lane with NO resolvable identity.
		const tmuxPane = (await readProcess(pid))?.environ.get("TMUX_PANE");
		const resolved = resolveOrchestratorIdentity(tmuxPane, orchSession, (msg) =>
			logger.warn(`[caller-label] ${msg}`),
		);
		if (resolved && !FORBIDDEN_HOST_ONLY.test(resolved)) {
			logger.debug(
				`Port ${remotePort} → PID ${pid} → orchestrator_session=${resolved}`,
			);
			return {
				label: `ui/${resolved.slice(0, 8)}`,
				tmuxSession: null,
				tmuxTarget: null,
				orchestratorSessionId: resolved,
				callerPid: pid,
			};
		}
		// Fleet opencode shared-server lane (`fleet-opencode-isolation`): one long-lived opencode-server process hosts every fleet lane as an
		// internal session — there is no per-lane subprocess and no tmux pane, so SCALA_ORCH_SESSION_ID is structurally absent (the scala-orch-
		// session-profile leaves it unset outside tmux). Without this resolution the caller identity is null, `stampCallerHeaders` forwards nothing,
		// and the downstream service re-resolves against the GATEWAY's own env (which carries the sentinel `SCALA_ORCH_SESSION_ID=tmux:%gateway`) —
		// the `single-notification-source` violation that produced the `tmux:%gateway` false-positive spoof alarms on every legitimate fleet
		// lane→orchestrator send (2026-07-14 through 2026-07-20). The gateway
		// attests the fleet-lane class here from the binary match; this is
		// stamped onto the downstream header by `stampCallerHeaders`, which
		// OVERWRITES any caller-supplied header, so the attestation is
		// unforgeable by the lane itself.
		if (binary === "opencode") {
			const fleetId = "opencode:fleet";
			logger.debug(
				`Port ${remotePort} → PID ${pid} (opencode shared server) → fleet identity ${fleetId} (no per-session SCALA_ORCH_SESSION_ID — structurally absent outside tmux)`,
			);
			return {
				label: "opencode/fleet",
				tmuxSession: null,
				tmuxTarget: null,
				orchestratorSessionId: fleetId,
				callerPid: pid,
			};
		}
		if (binary) {
			const detachedId = `${binary}:detached`;
			logger.debug(
				`Port ${remotePort} → PID ${pid} (${binary}, no tmux pane) → attested identity ${detachedId}`,
			);
			return {
				label: `${binary}/detached`,
				tmuxSession: null,
				tmuxTarget: null,
				orchestratorSessionId: detachedId,
				callerPid: pid,
			};
		}
		logger.warn(
			`[mcp-multi-session] No valid SCALA_ORCH_SESSION_ID in /proc/${pid}/environ and no orchestrator binary in the caller's process tree. ` +
				`Caller must inherit env from a shell that ran /etc/profile.d/scala-orch-session.sh (expected shape: tmux:%N). ` +
				`Verify: cat /proc/${pid}/environ | tr '\\0' '\\n' | grep SCALA_ORCH_SESSION_ID`,
		);
		return null;
	} catch (err) {
		logger.warn(
			`[mcp-multi-session] resolveCallerLabel failed for port ${remotePort}: ${err}`,
		);
		return null;
	}
}
