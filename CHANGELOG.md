# @teamgbg/mcp-multi-session

## 1.3.115

### Patch Changes

- 3c7bf26: feat(logger): downgrade expected protocol-probe 4xx to INFO

## 1.3.114

### Patch Changes

- 822c964: feat(worker-pool): stack-free saturation errors + window-aggregated logging + respondAllowOnPoolError wrapper

## 1.3.113

### Patch Changes

- 8382d22: feat(executor-dispatch): in-process worker-thread dispatcher backed by @teamgbg/worker-pool

## 1.3.112

### Patch Changes

- 9ba3e3f: feat(@teamgbg/worker-pool): unified multi-CPU dispatch primitive

## 1.3.79

### Patch Changes

- d1844ad: chore: version bump

## 1.3.78

### Patch Changes

- f5d3dfe: feat(master-switch): add write-master-switch-cache export

## 1.3.77

### Patch Changes

- 46e3551: chore: version bump

## 1.3.73

### Patch Changes

- 49947dd: fix(tool-generator): classify fleet_* tables as public scope

## 1.3.52

### Patch Changes

- 4a47580: fix: resolve env-var templates in MCP caller headers server-side

## 1.3.52

### Patch Changes

- c299fe8: refactor: add configure() to remaining 5 primitives — zero process.env in primitives tier

## 1.3.40

### Patch Changes

- 523d26a: chore: version bump

## 1.3.39

### Patch Changes

- 03248a8: chore: version bump

## 1.3.38

### Patch Changes

- f75188a: chore: version bump

## 1.3.37

### Patch Changes

- 4881a78: chore: version bump

## 1.3.36

### Patch Changes

- 6bb5e0e: chore: version bump

## 1.3.35

### Patch Changes

- a8186dd: chore: version bump

## 1.3.33

### Patch Changes

- 4348df2: refactor(tool-executor): remove internal executor and handler registry

## 1.3.25

### Patch Changes

- b0909ed: Gateway perf: cache list_mcp_servers via wired watchdog (521ms → 1.30ms median), drop shell-out in getPidFromPort (45ms → 31ms median /proc walk, 0.92ms header path unchanged), Server-Timing per-phase response header for observability.
- 6e50c2a: Add Server-Timing response header to createMcpRoute's stateless handler, capturing per-phase durations (new-transport, build-server, server-connect, caller-info, dispatch, close, total). Surfaces the per-request MCP SDK overhead so gateway latency regressions are observable without log-mining.

## 1.3.18

### Patch Changes

- 27eab71: create-mcp-route: remove the cross-orchestrator `lastKnownCaller` fallback. When a request lacked an orch header AND had no resolvable `x-caller-remote-port`, the gateway returned the PREVIOUS caller's identity (cached in a module-level `lastKnownCaller` with 60s TTL). This is the named broadcast-bug class from `notification-system.md` §4.3 — every new pane inherited the most-recently-resolved orchestrator's identity, routing fleet events to the wrong transcript. Per the doctrine end-state ("no fallback discovery anywhere"), the fallback is deleted; if all three resolution paths fail, CallerInfo carries nulls and the downstream procedure rejects per its schema (loud-fail per `no-shims`). The module-level cache variables are removed in the same change.

## 1.3.14

### Patch Changes

- e87728c: fix(otel-sdk): replace non-existent @opentelemetry/auto-node with correct imports

  feat(mcp): add caller provenance tracking — ipAddress, userAgent, rawTmuxTarget, rawOrchSession captured on every probe_channel call

  feat(probe-channel): log provenance in metadata_json for audit trail

  fix(fleet-executor): remove server-handlers dependency on broken otel-sdk

  fix(scala-tools): pm2-cli probe wrapped in try-catch; valibot schema renderer uses correct prisma client path

  fix(scala-codegen): service-prisma-schema uses correct client path

  feat(scala-guard): timing footer and force-run bypass

  feat(opencode-relay): drop probe slot events to reduce noise

## 1.3.11

### Patch Changes

- 8d7ff6b: Move both from utilities → primitives tier (git mv only — package source unchanged). Both packages had only primitive-tier @teamgbg deps (db, logger, orpc, http, os) — they were misplaced in utilities. Demotion to primitives makes mcp-tool-runtime → these become utilities → primitives = downward = legal. Removes 2 horizontal-deps violations.

## 1.3.8

### Patch Changes

- fix: await previous transport close before connecting new one to prevent "Already connected" race

## 1.3.6

### Patch Changes

- 8e49301: Persistent MCP Server + Transport, parallelized tool index build, Sentry spans

## 1.2.0

### Minor Changes

- 53484f8: Minor bump to definitively exceed Verdaccio's drifted "latest" tag (1.1.108) so the cross-orchestrator fix can propagate. The lastKnownCaller cache removal landed in commit 27eab7154 but the package never republished due to version contention with the previously-drifted Verdaccio entry.

## 1.1.108

### Patch Changes

- 54d9b38: Patch bump to exceed Verdaccio drift (latest tag stuck at 1.1.108 ahead of source).
- 54d9b38: Second patch bump to exceed Verdaccio drift — gets local from 1.1.108 to 1.1.109 so the cross-orch fix can publish.

## 1.1.107

### Patch Changes

- 30115ef: Republish to ship the cross-orchestrator `lastKnownCaller` fallback removal (commit `27eab7154`) past Verdaccio version drift. The source fix is already on main but was never bumped/published; consumers still install 1.1.108 which contains the cache, so every new pane still inherits the previous caller's identity (broadcast bug). Bumping forces verdaccio-poller to detect a gap, reinstall in mcp-gateway, restart the gateway, and propagate the fix into runtime.

## 1.1.106

### Patch Changes

- 27eab71: create-mcp-route: remove the cross-orchestrator `lastKnownCaller` fallback. When a request lacked an orch header AND had no resolvable `x-caller-remote-port`, the gateway returned the PREVIOUS caller's identity (cached in a module-level `lastKnownCaller` with 60s TTL). This is the named broadcast-bug class from `notification-system.md` §4.3 — every new pane inherited the most-recently-resolved orchestrator's identity, routing fleet events to the wrong transcript. Per the doctrine end-state ("no fallback discovery anywhere"), the fallback is deleted; if all three resolution paths fail, CallerInfo carries nulls and the downstream procedure rejects per its schema (loud-fail per `no-shims`). The module-level cache variables are removed in the same change.

## 1.1.105

### Patch Changes

- 12737d0: create-mcp-route: header is authoritative; /proc walk runs only when header is missing.

  Per `single-notification-source` invariant #2 the `x-caller-orchestrator-session` header is what the MCP config stamps (literal `${SCALA_ORCH_SESSION_ID}` resolved at write-time) and what the caller's shell carries. When that header arrives with a valid (non-forbidden) orch id, that's the source of truth — the resolver's `/proc` walk only exists to recover the orch when the header is absent.

  The previous order (walk `/proc` first, then look at header) rejected valid header-carrying callers whose own process tree had a stale env value — exactly the failure mode that prevents recovery of any orchestrator launched before `/etc/profile.d/scala-orch-session.sh` fired. With reordered precedence, header-correct callers proceed; only header-missing-AND-env-bad callers hit the strict throw. No fallback is introduced; the throw is preserved as the fail-loud surface per `no-shims`.

  Side note: the per-PID override lookup (`/tmp/scala-orch-session-<pid>.txt`) now happens only when the resolver actually walks /proc — overrides have always been a `/proc`-tier escape hatch, not a header-tier one.

## 1.1.104

### Patch Changes

- 5d7597c: mcp-multi-session: delete pane-map fallback, fail loud on missing env

## 1.1.103

### Patch Changes

- 5d7597c: mcp-multi-session: delete pane-map fallback, fail loud on missing env

## 1.1.102

### Patch Changes

- d113c67: Align mcp-multi-session resolver fallback shape with profile.d; widen no-host-only-orchestrator-id guard to enforce tmux:%N positive shape.

## 1.1.101

### Patch Changes

- 2cce113: Rename `scala-agents-mcp` → `scala-agents` across @teamgbg/\* package source.
  The service exposes MCP tools but is a UI-bearing service, not a backend
  MCP — the `-mcp` suffix was misleading and led repeated audits to
  mis-classify it. PM2 already ran the process as `scala-agents`; this
  aligns directory name, registry slugs, and string references to match.

  Companion to the registry rename (24 row slugs + 45 config-embedded refs)
  done via `scala-tools registry rename-slug`, and the directory rename
  `~/workspace/scala-agents-mcp/` → `~/workspace/scala-agents/`.

- Updated dependencies [4cd995b]
  - @teamgbg/http@2.0.0

## 1.1.100

### Patch Changes

- 2cce113: Rename `scala-agents-mcp` → `scala-agents` across @teamgbg/\* package source.
  The service exposes MCP tools but is a UI-bearing service, not a backend
  MCP — the `-mcp` suffix was misleading and led repeated audits to
  mis-classify it. PM2 already ran the process as `scala-agents`; this
  aligns directory name, registry slugs, and string references to match.

  Companion to the registry rename (24 row slugs + 45 config-embedded refs)
  done via `scala-tools registry rename-slug`, and the directory rename
  `~/workspace/scala-agents-mcp/` → `~/workspace/scala-agents/`.

- Updated dependencies [4cd995b]
  - @teamgbg/http@1.0.0

## 1.1.97

### Patch Changes

- 4bae353: Remove 'system:mcp' sentinel fallback from caller identity resolution

  When no X-Caller-Orchestrator-Session or X-Caller-Tmux-Target header was
  present and remote-port resolution failed, the MCP gateway and direct
  fleet API handler both fell back to orchestratorId="system:mcp". This
  synthetic value was written to fleet_agent_runs.orchestrator_id and then
  emitted in eventBus events, where the relay subscription filter correctly
  rejected it (relay binds to the real per-CLI id like tmux:%42).

  Fix: the fallback now sets null instead of the synthetic sentinel, and
  the slot reservation boundary rejects early when no real orchestrator
  identity is present in ALS. Per single-notification-source invariant #3,
  missing orchestratorSessionId at the procedure boundary is a hard reject.

  Code paths fixed:

  - mcp-multi-session/create-mcp-route.ts:101 — MCP gateway route fallback
  - server-handlers/handle-mcp.ts:127 — direct fleet API handler fallback
  - server-handlers/routes/api/mcp.ts:138 — fleet route handler fallback
  - slot-allocator/reservation.ts:32 — added guard rejecting null orchestratorId

## 1.1.96

### Patch Changes

- Debug logging for override resolution

## 1.1.95

### Patch Changes

- dc510d1: Gateway reads per-PID override file for live orchestrator session id instead of trusting stale header from Claude Code.

## 1.3.110
- fix: return null instead of throwing in resolveCallerLabelUncached
