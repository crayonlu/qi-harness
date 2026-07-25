# qi-harness capability matrix

Freeze date: 2026-07-25. Source of truth for what 1.x claims vs does not claim.

## Product freeze

| Decision | Status |
|----------|--------|
| Product shape | Single install: `pi install npm:@crayonlu/qi-harness`. Official Pi host only (`@earendil-works/pi-coding-agent`). |
| oh-my-pi | **Out of scope** — never a dependency or supported host mix. |
| Dependency strategy | **Hybrid**: Pin mature community packages; own/vendor perishable UX (`qi-cleanup`, `qi-bash-bg`, `qi-rewind`, slash categories, split diff). |
| `#11` double / empty Enter flush | **Not supported.** Will not be implemented or advertised. Use Pi native queue keys. |
| `#12` Esc early-cancel refill | **Not a product promise.** Pi native Esc aborts streaming and restores *already queued* messages; Claude-style “undo just-submitted prompt into the editor” requires upstream API and is deferred. |
| Queue | **Pi native**: Enter = steer, Alt+Enter = followUp, Esc / Alt+Up as documented by Pi. |
| `/goal` | **In P0** via Pin `@narumitw/pi-goal` + harness mutex / doctor — not a rewrite. |

Document these freezes in `/harness-setup` and README. Do not imply `#11` or `#12` parity.

## Expected.md coverage (1–17)

| # | Capability | Stage | Delivery | Notes |
|---|------------|-------|----------|-------|
| 1 | Slash secondary categories | **P0** | Owned UX (`slash-categories.ts`) | Sort `/` suggestions by group; no description tags / icons |
| 2 | Subagent bg / blocking / parallel | **P0** | Pin `pi-subagents` | Doctor rejects dual subagent stacks |
| 3 | Plan / build | **P0** | Pin `@narumitw/pi-plan-mode` + `/build` → `/plan implement` | Mutex with goal |
| 4 | Ask user question | **P0** | Pin `@juicesharp/rpiv-ask-user-question` | — |
| 5 | MCP | **P0** | Pin `pi-mcp-adapter` | — |
| 6 | `/btw` | **P0** | Pin `@juicesharp/rpiv-btw` | Doctor rejects concurrent `pi-btw` |
| 7 | Todo | **P0** | Pin `@juicesharp/rpiv-todo` | `/todos` or `/todo` |
| 8 | `/cleanup` | **P0** | Owned `qi-cleanup` | — |
| 9 | Bash background | **P1** | Owned `qi-bash-bg` | `process` tool + `/ps` `/ps:logs` `/ps:kill` `/ps:clear` |
| 10 | `/rewind` | **P1** | Owned `qi-rewind` | — |
| 11 | Double Enter flush | — | **Dropped** | Explicit freeze |
| 12 | Esc submit regret refill | — | **Not claimed** | Upstream / future epic only |
| 13 | Subagent model inherit | **P0** | Via `pi-subagents` | — |
| 14 | LSP | **P1** | Pin `@narumitw/pi-lsp` | — |
| 15 | Responsive split diff +/- | **P1** | Owned (`diff-split.ts`, edit/write `renderResult`, `/harness-diff`) | width &gt; 120 side-by-side; else stacked |
| 16 | Backlog / discuss | — | Open | — |
| 17 | `/goal` | **P0** | Pin `@narumitw/pi-goal` + adapter | Mutex enforced (tool block + auto `/goal pause`); network auto-pause = **P2** |

## Stage gates

### P0 — installable 1.0

- Meta package + `/harness-setup` + `/harness-doctor`
- Pin: subagents, mcp-adapter, plan-mode, ask, todo, btw, **goal ≥ 0.28**, cleanup
- Owned: slash categories
- Docs: native queue keys; **no** `#11` / **no** `#12` claim
- Gate: doctor PASS on clean install; plan↔goal mutex rules; acceptance scripts green

### P1 — editor productivity

- `qi-bash-bg`, `qi-rewind`, LSP default-on, split diff
- Gate: per-capability acceptance suites

### P2 — polish

- Goal: network-like failure → `/goal pause` (harness listens on `agent_end`; no `session_error` event in ExtensionAPI)
- Pin `@narumitw/pi-retry` by default. **`pi-statusline` is optional** (not bundled) — its powerline/emoji chrome is not Pi-native; install separately if wanted, and doctor still rejects statusline+starship mixes
- Upstream contributions: `RegisteredCommand.category`, Esc pending-submission API (enables future `#12`)

## Mode mutex (plan ↔ goal)

| Action | Rule |
|--------|------|
| Start goal while plan active | **Reject** — auto `/goal pause` on `pi-goal:state`; block `goal_*` tools |
| Enter plan while goal active | **Allow** + auto `/goal pause` |
| Observability | `/harness-mode`, status key `qi-harness-mode` |
| `/build` | Runs `/plan implement` (real exit + implement handoff) |

## Doctor hard failures (unless `--force`)

- Dual btw (`pi-btw` + `rpiv-btw`)
- Dual subagents (nicobailon `pi-subagents` + narumitw subagents)
- oh-my-pi paths mixed in
- Multiple goal packages / duplicate `/goal` registrations
- Pi version &lt; peer minimum (`0.80.6`)

## Hybrid dependency map

| Kind | Packages |
|------|----------|
| Pin | `pi-subagents`, `pi-mcp-adapter`, `@narumitw/pi-plan-mode`, `@narumitw/pi-goal`, `@narumitw/pi-lsp`, `@narumitw/pi-retry`, `@juicesharp/rpiv-*` |
| Owned | `@crayonlu/qi-cleanup`, `@crayonlu/qi-bash-bg`, `@crayonlu/qi-rewind`, harness UX (slash, diff, doctor, setup, mutex) |

## Explicit non-goals

- Replacing Pi with oh-my-pi
- Rewriting MCP / subagents / goal kernels
- Shipping two btw or two subagent implementations
- Passing `/compact` off as `/cleanup`
- Claiming Claude `#11` / `#12` interaction parity
