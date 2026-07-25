import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { ProcessesDetails } from "../constants";
import type { ProcessManager } from "../manager";
import { executeAction } from "./actions";

const PROCESS_ACTIONS = [
  "start",
  "list",
  "output",
  "logs",
  "kill",
  "clear",
  "write",
  "wait",
] as const;

const ProcessesParams = Type.Object({
  action: StringEnum(PROCESS_ACTIONS, {
    description:
      "Action: start (run command), list (show all), output (get recent output), logs (get log file paths), kill (terminate), clear (remove finished), write (write to stdin)",
  }),
  command: Type.Optional(
    Type.String({ description: "Command to run (required for start)" }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "Friendly name for the process (required for start, e.g. 'backend-dev', 'test-runner')",
    }),
  ),
  id: Type.Optional(
    Type.String({
      description:
        "Process ID, returned by start and list actions (required for output/kill/logs/write)",
    }),
  ),
  input: Type.Optional(
    Type.String({
      description: "Data to write to process stdin (required for write action)",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description:
        "Max milliseconds to wait for process exit (wait action only; default 600000)",
    }),
  ),
  end: Type.Optional(
    Type.Boolean({
      description:
        "Close stdin after writing (optional for write action, use for programs reading until EOF)",
    }),
  ),
  alertOnSuccess: Type.Optional(
    Type.Boolean({
      description:
        "Get a turn to react when process completes successfully (default: false). Use for builds/tests where you need confirmation.",
    }),
  ),
  alertOnFailure: Type.Optional(
    Type.Boolean({
      description:
        "Get a turn to react when process fails/crashes (default: true). Use to be alerted of unexpected failures.",
    }),
  ),
  alertOnKill: Type.Optional(
    Type.Boolean({
      description:
        "Get a turn to react when process is killed by external signal (default: false). Note: killing via tool never triggers a turn.",
    }),
  ),
  logWatches: Type.Optional(
    Type.Array(
      Type.Object(
        {
          pattern: Type.String({
            description:
              "Regular expression pattern to match against process output lines",
          }),
          stream: Type.Optional(
            StringEnum(["stdout", "stderr", "both"] as const, {
              description:
                "Which stream to watch (default: both). Use stdout/stderr to reduce noise.",
            }),
          ),
          repeat: Type.Optional(
            Type.Boolean({
              description:
                "Trigger every time this pattern matches (default: false, one-time)",
            }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  ),
});

type ProcessesParamsType = Static<typeof ProcessesParams>;

export function setupProcessesTools(pi: ExtensionAPI, manager: ProcessManager) {
  pi.registerTool<typeof ProcessesParams, ProcessesDetails>({
    name: "process",
    label: "Process",
    description: `Manage background processes. Actions:
- start: Run command in background (requires 'name' and 'command')
  - alertOnSuccess (default: false): Get a turn to react when process completes successfully
  - alertOnFailure (default: true): Get a turn to react when process crashes/fails
  - alertOnKill (default: false): Get a turn to react if killed by external signal (killing via tool never triggers a turn)
  - logWatches (optional): Runtime output watches that trigger immediate alerts while running
    - pattern: regex string to match per output line
    - stream: stdout | stderr | both (default both)
    - repeat: false by default (single-fire). Set true for repeat alerts
- list: Show all managed processes with their IDs and names
- output: Get recent stdout/stderr (requires 'id')
- logs: Get log file paths to inspect with read tool (requires 'id')
- kill: Terminate a process (requires 'id')
- clear: Remove all finished processes from the list
- write: Write to process stdin (requires 'id' and 'input', optional 'end' to close stdin)
- wait: Block until process exits (requires 'id'; optional timeoutMs)

Important: Prefer alerts over polling. Use wait only when the next step truly depends on process completion.`,
    promptSnippet:
      "Manage background processes without blocking the conversation",
    promptGuidelines: [
      "Use the process tool for long-running commands such as dev servers, test watchers, build watchers, and log tails instead of bash.",
      "Avoid shell background patterns such as &, nohup, disown, or setsid when the process tool fits.",
      "After starting a process, continue other work instead of waiting for it.",
      "Use wait when the next step truly depends on process completion; otherwise rely on alerts.",
    ],

    parameters: ProcessesParams,

    // ponytail: render hooks omitted — pi's default tool rendering is fine and
    // avoids the @aliou/pi-utils-ui (ToolBody/ToolCallHeader) dependency.
    // All tool output is plain text in result.content, which pi renders natively.
    async execute(_toolCallId, params: ProcessesParamsType, _signal, _onUpdate, ctx) {
      return executeAction(params, manager, ctx);
    },
  });
}
