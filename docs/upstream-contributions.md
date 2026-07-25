# Upstream contributions (P2)

qi-harness deliberately stays an Extension on `@earendil-works/pi-coding-agent`. Two gaps need core API to ship at Claude Code fidelity:

## 1. `RegisteredCommand.category`

**Problem:** Slash autocomplete can only regroup by name heuristics (`slash-categories.ts`). A first-class `category?: string` on `registerCommand` would let packages declare Builtin / Session / Agent / Tools / MCP / Goal without wrappers.

**Proposed:** Add optional `category` to `registerCommand` options; `CombinedAutocompleteProvider` groups by category then name; document conventions.

**Tracking:** Open PR against `earendil-works/pi-mono` once qi-harness 1.0 is stable. Until merged, harness wrapper remains the production path (full, not weakened).

## 2. Esc pending-submission API (`#12`)

**Problem:** Claude Code restores the just-submitted user prompt on Esc when no substantive assistant/tool output exists. Upstream Pi Esc restores *queued* steer/followUp messages only. OMP’s `cancelPendingSubmission()` is not on the Extension API.

**Proposed:** Expose something like `ctx.ui` / session hooks:

- `pendingUserSubmission?: { text: string; started: boolean }`
- or event `user_submit` / `user_cancel` with refill helper

**Product stance:** qi-harness **does not claim `#12`** until this lands and we implement against it. No half-measures in README.

## Not proposed

- Baking MCP / subagents / plan / goal into Pi core (contradicts Pi philosophy; harness exists to fill that layer).
- Double Enter flush (`#11`) — explicitly dropped by product freeze.
