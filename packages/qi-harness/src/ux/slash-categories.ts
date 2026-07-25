/**
 * Slash-command secondary categories for autocomplete.
 *
 * Wraps AutocompleteProvider so `/` completions are sorted by category group
 * (Builtin → Session → Agent → Tools → MCP → Goal → Other), then by name.
 * Descriptions are left unchanged — no tags, icons, or prefixes (Pi-native look).
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

	// Heuristic prefixes for extension-namespaced commands
	if (base.startsWith("mcp") || base.includes("mcp-")) return "MCP";
	if (base.startsWith("goal") || base.includes("goal-")) return "Goal";
	if (base.startsWith("lsp") || base.includes("lsp-")) return "Tools";
	if (base.startsWith("process") || base.startsWith("ps")) return "Tools";
	if (base.startsWith("subagent") || base === "run") return "Agent";

	return "Other";
}

function categoryRank(cat: SlashCategory): number {
	return CATEGORY_RANK.get(cat) ?? CATEGORY_ORDER.length;
}

/**
 * Sort suggestions by category order, then name. Does not mutate descriptions.
 */
export function regroupSlashSuggestions(items: AutocompleteItem[]): AutocompleteItem[] {
	return [...items].sort((a, b) => {
		const ca = matchCommandCategory(a.value || a.label);
		const cb = matchCommandCategory(b.value || b.label);
		const cr = categoryRank(ca) - categoryRank(cb);
		if (cr !== 0) return cr;
		const an = (a.value || a.label).toLowerCase();
		const bn = (b.value || b.label).toLowerCase();
		return an.localeCompare(bn);
	});
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
		applyCompletion: (lines, cursorLine, cursorCol, item, prefix) =>
			current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
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
 * On session_start, stack an autocomplete wrapper that regroups `/` suggestions.
 */
export function registerSlashCategories(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.addAutocompleteProvider(wrapProvider);
	});
}
