# qi-bash-bg

Background process management for Pi (`process` tool + `/ps` commands + lifecycle hooks).

Adapted from the pi-processes lineage for `@earendil-works/*`. Bundled by `@crayonlu/qi-harness`.

## Slash commands

| Command | Action |
|---------|--------|
| `/ps` | List background processes |
| `/ps:logs [id]` | Show log paths + recent stdout/stderr (picker if no id) |
| `/ps:kill [id]` | SIGTERM a process (picker if no id) |
| `/ps:clear` | Remove finished processes from the list |

Deprecated aliases: `/process:list`, `/process:logs`, `/process:kill`, `/process:clear`.

## Tool

The `process` tool supports `start`, `list`, `output`, `logs`, `kill`, `clear`, `write`, and `wait`.
