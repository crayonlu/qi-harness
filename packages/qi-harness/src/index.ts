/**
 * @crayonlu/qi-harness — omnibus Pi extension entry.
 *
 * Pin packages listed in package.json `pi.extensions` load alongside this file.
 * This module wires harness-owned UX: doctor/setup, plan↔goal mutex, slash
 * categories, and split diff.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPlanGoalMutex } from "./adapters/plan-goal.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerSetupCommand } from "./commands/setup.js";
import { ModeMutex } from "./mode/mutex.js";
import { registerDiffSplit } from "./ux/diff-split.js";
import { registerSlashCategories } from "./ux/slash-categories.js";

export type { DoctorInput, DoctorReport } from "./commands/doctor.js";
export type { ModeSnapshot, CanStartGoalResult, CanEnterPlanResult } from "./mode/mutex.js";
export type { SlashCategory } from "./ux/slash-categories.js";
export { ModeMutex } from "./mode/mutex.js";
export { runDoctorChecks, compareSemverIsh } from "./commands/doctor.js";
export { formatSplitDiff } from "./ux/diff-split.js";
export { matchCommandCategory, CATEGORY_ORDER, regroupSlashSuggestions } from "./ux/slash-categories.js";

const LOADED_ENTRY = "qi-harness-loaded";
const MIN_PI_VERSION = "0.80.6";

export default async function (pi: ExtensionAPI): Promise<void> {
	const mutex = new ModeMutex();

	registerDoctorCommand(pi, { minPiVersion: MIN_PI_VERSION });
	registerSetupCommand(pi, { minPiVersion: MIN_PI_VERSION });
	registerPlanGoalMutex(pi, mutex);
	registerSlashCategories(pi);
	registerDiffSplit(pi);

	let notifiedLoad = false;

	pi.on("session_start", async (_event, ctx) => {
		pi.appendEntry(LOADED_ENTRY, {
			version: "1.0.0",
			at: Date.now(),
		});

		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type === "custom" && entry.customType === LOADED_ENTRY) {
				pi.setLabel(entry.id, "qi-harness");
				break;
			}
		}

		ctx.ui.setStatus("qi-harness", "qi-harness");

		if (!notifiedLoad) {
			notifiedLoad = true;
			ctx.ui.notify("qi-harness loaded", "info");
		}
	});
}
