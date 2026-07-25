# Install

## Requirements

- Node 22+
- `@earendil-works/pi-coding-agent` **>= 0.80.6** (goal / plan need `agent_settled`)

## From npm

```bash
pi install npm:@crayonlu/qi-harness
```

Restart Pi or run `/reload`, then:

```text
/harness-setup
/harness-doctor
```

Typing `/` should show a secondary menu with category headers (Builtin, Session, Agent, Tools, MCP, Goal, …).

## Publishing (maintainers)

Scoped packages default private on npm. This repo sets `access=public` in `.npmrc` and each package’s `publishConfig`. Prefer:

```bash
npm run publish:public
```

That publishes with `--access public` and verifies the package is readable without auth (re-runs `npm access set status=public` if needed).

Optional global default for your machine:

```bash
npm config set access public --global
```

## From this monorepo (dev)

```bash
cd qi-harness
npm install --ignore-scripts
pi -e ./packages/qi-harness
# or permanently:
pi install ./packages/qi-harness
```

## Conflict policy

Do **not** also install:

- `@narumitw/pi-btw` (we ship `@juicesharp/rpiv-btw`)
- `@narumitw/pi-subagents` (we ship `pi-subagents`)
- a second `/goal` package alongside `@narumitw/pi-goal`
- oh-my-pi as the host

`/harness-doctor` fails hard on these unless `--force`.

## Smoke checklist (P0)

1. `/plan` enters read-only collaboration  
2. Ask-user / todo / `/btw` respond  
3. Subagent run (blocking + one background)  
4. `/mcp` opens (with config)  
5. `/goal` set → pause → resume → complete  
6. `/cleanup` dry-run  
7. `/harness-doctor` PASS  
