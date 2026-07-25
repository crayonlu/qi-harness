# @crayonlu/qi-harness

Production omnibus extension for [Pi](https://pi.dev): one `pi install`, Claude Code–grade daily harness on the official Pi host.

```bash
pi install npm:@crayonlu/qi-harness
# restart Pi or /reload
/harness-setup
/harness-doctor
```

**Security:** Pi packages run with full system access. Review source before installing.

## What you get

| Area | Capability |
|------|------------|
| Modes | `/plan` + `/build` guidance, `/goal` (pin `@narumitw/pi-goal`), plan↔goal mutex |
| Agents | `pi-subagents` — blocking / background / parallel, model inherit |
| Tools | MCP (`pi-mcp-adapter`), ask-user, todo, `/btw`, LSP, bash background (`process`), `/rewind`, `/cleanup` |
| UX | Slash secondary categories, `/harness-diff` responsive +/- split |

## Queue (Pi native — not reinvented)

- **Enter** while busy → steer  
- **Alt+Enter** → follow-up  
- **Esc** → abort + restore *queued* messages  
- **Alt+Up** → pull queued text back to the editor  

**Not supported (by design):** double/empty Enter flush (`#11`); Claude-style Esc “undo just-submitted prompt” (`#12`).

## Commands

| Command | Role |
|---------|------|
| `/harness-setup` | Install narrative + freezes + doctor |
| `/harness-doctor` | Conflicts, Pi version, expected commands (`--force` demotes hard fails) |
| `/harness-mode` | Plan/goal mutex snapshot |
| `/harness-diff <old> <new>` | Split (width>120) or stacked +/- diff |
| `/build` | Mark plan inactive + guidance to `/plan implement` |
| `/cleanup` | Janitor for `~/.pi` cruft (≠ `/compact`) |
| `/goal` `/plan` `/btw` `/todos` `/rewind` `/mcp` … | From bundled Pin / owned packages |

## Monorepo packages

| Package | Role |
|---------|------|
| `@crayonlu/qi-harness` | Unique public install entry (bundles Pins + owned) |
| `@crayonlu/qi-cleanup` | `/cleanup` |
| `@crayonlu/qi-bash-bg` | Background `process` tool |
| `@crayonlu/qi-rewind` | Checkpoints + `/rewind` |

## Develop

```bash
cd qi-harness
npm install --ignore-scripts
npm test
npm run typecheck
pi -e ./packages/qi-harness   # load from workspace (resolves workspace deps)
```

## Docs

- [Capability matrix](docs/capability-matrix.md) — freeze + P0/P1/P2 gates  
- [Install](docs/install.md)  
- [Upstream contributions](docs/upstream-contributions.md) — category API / Esc pending submission  

## License

MIT
