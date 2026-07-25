import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ExecuteResult, ProcessAction } from "../../constants";
import type { ProcessManager } from "../../manager";
import { executeClear } from "./clear";
import { executeKill } from "./kill";
import { executeList } from "./list";
import { executeLogs } from "./logs";
import { executeOutput } from "./output";
import { executeStart } from "./start";
import { executeWait } from "./wait";
import { executeWrite } from "./write";

interface ActionParams {
  action: ProcessAction | string;
  command?: string;
  name?: string;
  id?: string;
  input?: string;
  end?: boolean;
  timeoutMs?: number;
  alertOnSuccess?: boolean;
  alertOnFailure?: boolean;
  alertOnKill?: boolean;
  logWatches?: Array<{
    pattern: string;
    stream?: "stdout" | "stderr" | "both";
    repeat?: boolean;
  }>;
}

export async function executeAction(
  params: ActionParams,
  manager: ProcessManager,
  ctx: ExtensionContext,
): Promise<ExecuteResult> {
  switch (params.action) {
    case "start":
      return executeStart(params, manager, ctx);
    case "list":
      return executeList(manager);
    case "output":
      return executeOutput(params, manager);
    case "logs":
      return executeLogs(params, manager);
    case "kill":
      return executeKill(params, manager);
    case "clear":
      return executeClear(manager);
    case "write":
      return executeWrite(params, manager);
    case "wait":
      return executeWait(params, manager);
    default:
      return {
        content: [{ type: "text", text: `Unknown action: ${params.action}` }],
        details: {
          action: params.action as ProcessAction,
          success: false,
          message: `Unknown action: ${params.action}`,
        },
      };
  }
}
