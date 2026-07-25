/**
 * Slash-command secondary categories for autocomplete.
 *
 * Wraps AutocompleteProvider so `/` completions show a Pi-style secondary menu:
 * plain category headers (Builtin, Session, …) above each group, then commands
 * sorted by name. No emoji, no tags, no gradients.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";

export type SlashCategory = "Builtin" | "Session" | "Agent" | "Tools" | "MCP" | "Goal" | "Other";

export const CATEGORY_ORDER: readonly SlashCategory[] = [
	"Builtin",
	"Session",
	"Agent",
	"Tools",
	"MCP",
	"Goal",
	"Other",
] as const;

/** Sentinel value prefix for non-selectable category header rows. */
export const CATEGORY_HEADER_PREFIX = "\0qi-cat:";

const CATEGORY_RANK = new Map<SlashCategory, number>(
	CATEGORY_ORDER.map((c, i) => [c, i]),
);

/** Exact / prefix command → category. First match wins; checked most-specific first. */
const NAME_RULES: ReadonlyArray<{ category: SlashCategory; names: readonly string[] }> = [
	{ category: "Builtin", names: ["model", "settings", "quit", "help", "theme", "login", "logout"] },
	{
		category: "Session",
		names: [
			"plan",
			"build",
			"compact",
			"tree",
			"fork",
			"clone",
			"session",
			"cleanup",
			"rewind",
			"btw",
			"todos",
			"todo",
			"new",
			"resume",
			"export",
			"import",
			"share",
		],
	},
	{ category: "Agent", names: ["run", "subagents", "subagent", "agents", "agent"] },
	{ category: "Goal", names: ["goal"] },
	{ category: "MCP", names: ["mcp"] },
	{
		category: "Tools",
		names: ["ps", "process", "processes", "lsp", "harness-diff", "harness-doctor", "harness-setup", "harness-mode"],
	},
];

/**
 * Map a slash command name (with or without leading `/`, optional `:N` suffix) to a category.
 */
export function matchCommandCategory(name: string): SlashCategory {
	const raw = name.trim().replace(/^\//, "");
	const base = raw.toLowerCase().replace(/:\d+$/, "");
	if (!base) return "Other";

	for (const rule of NAME_RULES) {
		for (const n of rule.names) {
			if (base === n || base.startsWith(`${n}-`) || base.startsWith(`${n}:`)) {
				return rule.category;
			}
		}
	}

	if (base.startsWith("mcp") || base.includes("mcp-")) return "MCP";
	if (base.startsWith("goal") || base.includes("goal-")) return "Goal";
	if (base.startsWith("lsp") || base.includes("lsp-")) return "Tools";
	if (base.startsWith("process") || base.startsWith("ps")) return "Tools";
	if (base.startsWith("subagent") || base === "run") return "Agent";
	if (base.startsWith("harness-")) return "Tools";

	return "Other";
}

export function isCategoryHeader(item: AutocompleteItem): boolean {
	return typeof item.value === "string" && item.value.startsWith(CATEGORY_HEADER_PREFIX);
}

function categoryHeader(cat: SlashCategory): AutocompleteItem {
	return {
		value: `${CATEGORY_HEADER_PREFIX}${cat}`,
		label: cat,
	};
}

function categoryRank(cat: SlashCategory): number {
	return CATEGORY_RANK.get(cat) ?? CATEGORY_ORDER.length;
}

/**
 * Insert plain category headers and sort commands within each group.
 * Headers are not real commands (applyCompletion no-ops on them).
 */
export function regroupSlashSuggestions(items: AutocompleteItem[]): AutocompleteItem[] {
	const buckets = new Map<SlashCategory, AutocompleteItem[]>();
	for (const item of items) {
		if (isCategoryHeader(item)) continue;
		const cat = matchCommandCategory(item.value || item.label);
		const list = buckets.get(cat) ?? [];
		list.push(item);
		buckets.set(cat, list);
	}

	const out: AutocompleteItem[] = [];
	for (const cat of CATEGORY_ORDER) {
		const group = buckets.get(cat);
		if (!group || group.length === 0) continue;
		group.sort((a, b) => {
			const an = (a.value || a.label).toLowerCase();
			const bn = (b.value || b.label).toLowerCase();
			return an.localeCompare(bn);
		});
		out.push(categoryHeader(cat));
		out.push(...group);
	}

	// Stable fallback if somehow empty categories
	if (out.length === 0) {
		return [...items].sort((a, b) => {
			const cr =
				categoryRank(matchCommandCategory(a.value || a.label)) -
				categoryRank(matchCommandCategory(b.value || b.label));
			if (cr !== 0) return cr;
			return (a.value || a.label).toLowerCase().localeCompare((b.value || b.label).toLowerCase());
		});
	}
	return out;
}

/** True when the cursor is inside a slash-command token (starts with `/`, no space yet). */
export function isSlashCommandCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
	const line = lines[cursorLine] ?? "";
	const before = line.slice(0, cursorCol);
	return /(^|\s)\/[^\s]*$/.test(before);
}

function wrapProvider(current: AutocompleteProvider): AutocompleteProvider {
	return {
		triggerCharacters: current.triggerCharacters,
		shouldTriggerFileCompletion: current.shouldTriggerFileCompletion?.bind(current),
		applyCompletion: (lines, cursorLine, cursorCol, item, prefix) => {
			// Category headers are menu chrome only — do not insert into the editor
			if (isCategoryHeader(item)) {
				return { lines, cursorLine, cursorCol };
			}
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);
			if (!result || result.items.length === 0) return result;
			if (!isSlashCommandCompletion(lines, cursorLine, cursorCol)) return result;
			return {
				...result,
				items: regroupSlashSuggestions(result.items),
			};
		},
	};
}

/**
 * On session_start, stack an autocomplete wrapper that shows `/` secondary categories.
 */
export function registerSlashCategories(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.addAutocompleteProvider(wrapProvider);
	});
}
