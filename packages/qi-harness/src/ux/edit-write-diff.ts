/**
 * Override built-in edit/write tool renderers to show responsive split/stacked diffs.
 */

import {
	createEditTool,
	createWriteTool,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatSplitDiff } from "./diff-split.js";

const SPLIT_THRESHOLD = 120;

function terminalWidth(): number {
	return typeof process.stdout.columns === "number" && process.stdout.columns > 0
		? process.stdout.columns
		: 80;
}

function colorizeDiffLines(text: string, theme: Theme): string {
	return text
		.split("\n")
		.map((line) => {
			const pipe = line.indexOf(" | ");
			if (pipe >= 0) {
				const left = line.slice(0, pipe);
				const right = line.slice(pipe + 3);
				const leftColored = colorizeMarkerLine(left, theme);
				const rightColored = colorizeMarkerLine(right, theme);
				return `${leftColored} | ${rightColored}`;
			}
			return colorizeMarkerLine(line, theme);
		})
		.join("\n");
}

function colorizeMarkerLine(line: string, theme: Theme): string {
	if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("success", line);
	if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("error", line);
	if (line.startsWith("─") || line.includes("old") || line.includes("new")) {
		return theme.fg("dim", line);
	}
	return theme.fg("dim", line);
}

function countMarkers(text: string): { additions: number; removals: number } {
	let additions = 0;
	let removals = 0;
	for (const line of text.split("\n")) {
		if (line.includes(" | ")) {
			for (const part of line.split(" | ")) {
				const t = part.trimStart();
				if (t.startsWith("+ ")) additions++;
				else if (t.startsWith("- ")) removals++;
			}
		} else {
			if (line.startsWith("+ ")) additions++;
			else if (line.startsWith("- ")) removals++;
		}
	}
	return { additions, removals };
}

interface EditArgShape {
	path?: string;
	edits?: Array<{ oldText?: string; newText?: string }>;
	oldText?: string;
	newText?: string;
}

function editsToSides(args: unknown): { oldText: string; newText: string } | null {
	if (!args || typeof args !== "object") return null;
	const a = args as EditArgShape;
	const edits = Array.isArray(a.edits) ? [...a.edits] : [];
	if (typeof a.oldText === "string" && typeof a.newText === "string") {
		edits.push({ oldText: a.oldText, newText: a.newText });
	}
	if (edits.length === 0) return null;
	const oldParts: string[] = [];
	const newParts: string[] = [];
	for (const e of edits) {
		if (typeof e.oldText === "string") oldParts.push(e.oldText);
		if (typeof e.newText === "string") newParts.push(e.newText);
	}
	if (oldParts.length === 0 && newParts.length === 0) return null;
	return {
		oldText: oldParts.join("\n\n"),
		newText: newParts.join("\n\n"),
	};
}

/**
 * Register edit + write tool overrides with split/stacked diff rendering.
 */
export function registerEditWriteDiff(pi: ExtensionAPI): void {
	let originalEdit = createEditTool(process.cwd());
	let originalWrite = createWriteTool(process.cwd());

	pi.on("session_start", async (_event, ctx) => {
		originalEdit = createEditTool(ctx.cwd);
		originalWrite = createWriteTool(ctx.cwd);
	});

	pi.registerTool({
		name: "edit",
		label: "edit",
		description: originalEdit.description,
		parameters: originalEdit.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalEdit.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const path = typeof (args as { path?: string }).path === "string" ? (args as { path: string }).path : "?";
			let text = theme.fg("toolTitle", theme.bold("edit "));
			text += theme.fg("accent", path);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing..."), 0, 0);

			const content = result.content[0];
			if (content?.type === "text" && content.text.startsWith("Error")) {
				return new Text(theme.fg("error", content.text.split("\n")[0] ?? content.text), 0, 0);
			}

			const sides = editsToSides(context.args);
			const width = terminalWidth();

			if (!sides) {
				const details = result.details as { diff?: string } | undefined;
				if (!details?.diff) {
					return new Text(theme.fg("success", "Applied"), 0, 0);
				}
				// Fallback: show built-in unified diff with +/- coloring
				const diffLines = details.diff.split("\n");
				let additions = 0;
				let removals = 0;
				for (const line of diffLines) {
					if (line.startsWith("+") && !line.startsWith("+++")) additions++;
					if (line.startsWith("-") && !line.startsWith("---")) removals++;
				}
				let text = theme.fg("success", `+${additions}`);
				text += theme.fg("dim", " / ");
				text += theme.fg("error", `-${removals}`);
				if (expanded) {
					const body = colorizeDiffLines(diffLines.slice(0, 40).join("\n"), theme);
					text += `\n${body}`;
					if (diffLines.length > 40) {
						text += `\n${theme.fg("muted", `... ${diffLines.length - 40} more diff lines`)}`;
					}
				}
				return new Text(text, 0, 0);
			}

			const rendered = formatSplitDiff(sides.oldText, sides.newText, width);
			const { additions, removals } = countMarkers(rendered);
			let text = theme.fg("success", `+${additions}`);
			text += theme.fg("dim", " / ");
			text += theme.fg("error", `-${removals}`);
			text += theme.fg("dim", width > SPLIT_THRESHOLD ? " (split)" : " (stacked)");

			if (expanded) {
				const lines = rendered.split("\n");
				const shown = lines.slice(0, 60).join("\n");
				text += `\n${colorizeDiffLines(shown, theme)}`;
				if (lines.length > 60) {
					text += `\n${theme.fg("muted", `... ${lines.length - 60} more lines`)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "write",
		label: "write",
		description: originalWrite.description,
		parameters: originalWrite.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalWrite.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const path =
				typeof (args as { path?: string }).path === "string" ? (args as { path: string }).path : "?";
			let text = theme.fg("toolTitle", theme.bold("write "));
			text += theme.fg("accent", path);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Writing..."), 0, 0);

			const content = result.content[0];
			if (content?.type === "text" && content.text.startsWith("Error")) {
				return new Text(theme.fg("error", content.text.split("\n")[0] ?? content.text), 0, 0);
			}

			const args = context.args as { content?: string; path?: string } | undefined;
			const newText = typeof args?.content === "string" ? args.content : "";
			const width = terminalWidth();
			const rendered = formatSplitDiff("", newText, width);
			const { additions } = countMarkers(rendered);

			let text = theme.fg("success", `+${additions} lines`);
			text += theme.fg("dim", width > SPLIT_THRESHOLD ? " (split)" : " (stacked)");

			if (expanded && newText) {
				const lines = rendered.split("\n");
				const shown = lines.slice(0, 60).join("\n");
				text += `\n${colorizeDiffLines(shown, theme)}`;
				if (lines.length > 60) {
					text += `\n${theme.fg("muted", `... ${lines.length - 60} more lines`)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
