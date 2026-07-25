/**
 * Responsive split / stacked diff formatter (+/- markers).
 * Pure function — no Pi deps. Also registers `/harness-diff`.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SPLIT_THRESHOLD = 120;

function pad(s: string, width: number): string {
	if (s.length >= width) return s.slice(0, width);
	return s + " ".repeat(width - s.length);
}

function truncate(s: string, width: number): string {
	if (width <= 0) return "";
	if (s.length <= width) return s;
	if (width <= 1) return s.slice(0, width);
	return `${s.slice(0, width - 1)}…`;
}

/**
 * Line-based diff: walk both sides; equal lines are context,
 * otherwise emit - then + (or left/right for split).
 * Not a full LCS — good enough for preview and deterministic tests.
 */
export function formatSplitDiff(oldText: string, newText: string, width: number): string {
	const oldLines = oldText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	const newLines = newText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

	// Drop trailing empty line from final newline so files ending with \n compare cleanly
	if (oldLines.length > 0 && oldLines[oldLines.length - 1] === "") oldLines.pop();
	if (newLines.length > 0 && newLines[newLines.length - 1] === "") newLines.pop();

	if (width > SPLIT_THRESHOLD) {
		return formatSideBySide(oldLines, newLines, width);
	}
	return formatStacked(oldLines, newLines);
}

function formatStacked(oldLines: string[], newLines: string[]): string {
	const out: string[] = [];
	const max = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < max; i++) {
		const o = i < oldLines.length ? oldLines[i] : undefined;
		const n = i < newLines.length ? newLines[i] : undefined;
		if (o !== undefined && n !== undefined && o === n) {
			out.push(`  ${o}`);
		} else {
			if (o !== undefined) out.push(`- ${o}`);
			if (n !== undefined) out.push(`+ ${n}`);
		}
	}
	return out.join("\n");
}

function formatSideBySide(oldLines: string[], newLines: string[], width: number): string {
	// " | " separator + two marker columns ("- "/" + "/"  ")
	const sep = " | ";
	const usable = Math.max(20, width - sep.length);
	const leftW = Math.floor(usable / 2);
	const rightW = usable - leftW;
	const contentLeft = Math.max(4, leftW - 2);
	const contentRight = Math.max(4, rightW - 2);

	const out: string[] = [];
	const header =
		pad(truncate("- old", leftW), leftW) + sep + pad(truncate("+ new", rightW), rightW);
	out.push(header);
	out.push("-".repeat(Math.min(width, header.length)));

	const max = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < max; i++) {
		const o = i < oldLines.length ? oldLines[i] : undefined;
		const n = i < newLines.length ? newLines[i] : undefined;

		if (o !== undefined && n !== undefined && o === n) {
			const left = pad(`  ${truncate(o, contentLeft)}`, leftW);
			const right = pad(`  ${truncate(n, contentRight)}`, rightW);
			out.push(left + sep + right);
		} else {
			const leftRaw = o !== undefined ? `- ${truncate(o, contentLeft)}` : " ".repeat(2);
			const rightRaw = n !== undefined ? `+ ${truncate(n, contentRight)}` : " ".repeat(2);
			out.push(pad(leftRaw, leftW) + sep + pad(rightRaw, rightW));
		}
	}
	return out.join("\n");
}

function parseDiffArgs(args: string): { oldPath: string; newPath: string } | null {
	const trimmed = args.trim();
	if (!trimmed) return null;
	// Support simple quoted paths or whitespace-separated
	const match = trimmed.match(/^("([^"]+)"|'([^']+)'|(\S+))\s+("([^"]+)"|'([^']+)'|(\S+))\s*$/);
	if (!match) return null;
	const oldPath = match[2] ?? match[3] ?? match[4];
	const newPath = match[6] ?? match[7] ?? match[8];
	if (!oldPath || !newPath) return null;
	return { oldPath, newPath };
}

/**
 * Register `/harness-diff <old> <new>` — reads two files and shows formatted diff.
 */
export function registerDiffSplit(pi: ExtensionAPI): void {
	pi.registerCommand("harness-diff", {
		description: "Show responsive split/stacked diff between two files (+/- markers)",
		handler: async (args, ctx) => {
			const parsed = parseDiffArgs(args);
			if (!parsed) {
				ctx.ui.notify("Usage: /harness-diff <old-file> <new-file>", "warning");
				return;
			}

			const oldPath = resolve(ctx.cwd, parsed.oldPath);
			const newPath = resolve(ctx.cwd, parsed.newPath);

			let oldText: string;
			let newText: string;
			try {
				oldText = await readFile(oldPath, "utf8");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Cannot read old file: ${oldPath}\n${msg}`, "error");
				return;
			}
			try {
				newText = await readFile(newPath, "utf8");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Cannot read new file: ${newPath}\n${msg}`, "error");
				return;
			}

			const cols =
				typeof process.stdout.columns === "number" && process.stdout.columns > 0
					? process.stdout.columns
					: 80;

			const rendered = formatSplitDiff(oldText, newText, cols);
			const header = `diff ${parsed.oldPath} → ${parsed.newPath} (width=${cols}, ${cols > SPLIT_THRESHOLD ? "side-by-side" : "stacked"})\n`;
			ctx.ui.notify(header + rendered, "info");
		},
	});
}
