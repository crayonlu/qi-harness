import { describe, expect, it } from "vitest";
import {
	CATEGORY_ORDER,
	isSlashCommandCompletion,
	matchCommandCategory,
	regroupSlashSuggestions,
} from "../src/ux/slash-categories.js";

describe("matchCommandCategory", () => {
	it("maps builtin commands", () => {
		expect(matchCommandCategory("model")).toBe("Builtin");
		expect(matchCommandCategory("/settings")).toBe("Builtin");
		expect(matchCommandCategory("quit")).toBe("Builtin");
	});

	it("maps session commands", () => {
		for (const name of ["plan", "build", "compact", "tree", "fork", "clone", "session", "cleanup", "rewind", "btw", "todos"]) {
			expect(matchCommandCategory(name)).toBe("Session");
		}
		expect(matchCommandCategory("todo")).toBe("Session");
	});

	it("maps agent / goal / mcp / tools", () => {
		expect(matchCommandCategory("run")).toBe("Agent");
		expect(matchCommandCategory("subagents")).toBe("Agent");
		expect(matchCommandCategory("goal")).toBe("Goal");
		expect(matchCommandCategory("goal:1")).toBe("Goal");
		expect(matchCommandCategory("mcp")).toBe("MCP");
		expect(matchCommandCategory("ps")).toBe("Tools");
		expect(matchCommandCategory("process")).toBe("Tools");
		expect(matchCommandCategory("lsp")).toBe("Tools");
	});

	it("maps harness commands to Tools", () => {
		expect(matchCommandCategory("harness-doctor")).toBe("Tools");
		expect(matchCommandCategory("harness-setup")).toBe("Tools");
		expect(matchCommandCategory("harness-mode")).toBe("Tools");
		expect(matchCommandCategory("harness-diff")).toBe("Tools");
	});

	it("falls back to Other", () => {
		expect(matchCommandCategory("xyzzy")).toBe("Other");
		expect(matchCommandCategory("foo-bar")).toBe("Other");
	});
});

describe("CATEGORY_ORDER", () => {
	it("lists all categories in display order", () => {
		expect(CATEGORY_ORDER).toEqual(["Builtin", "Session", "Agent", "Tools", "MCP", "Goal", "Other"]);
	});
});

describe("regroupSlashSuggestions", () => {
	it("prefixes descriptions and sorts by category then name", () => {
		const items = regroupSlashSuggestions([
			{ value: "goal", label: "/goal", description: "manage goal" },
			{ value: "model", label: "/model", description: "pick model" },
			{ value: "mcp", label: "/mcp", description: "mcp tools" },
			{ value: "plan", label: "/plan", description: "plan mode" },
			{ value: "aaa-custom", label: "/aaa-custom", description: "custom" },
		]);

		expect(items.map((i) => i.value)).toEqual(["model", "plan", "mcp", "goal", "aaa-custom"]);
		expect(items[0]?.description).toMatch(/^\[Builtin\]/);
		expect(items[1]?.description).toMatch(/^\[Session\]/);
		expect(items[2]?.description).toMatch(/^\[MCP\]/);
		expect(items[3]?.description).toMatch(/^\[Goal\]/);
		expect(items[4]?.description).toMatch(/^\[Other\]/);
	});

	it("does not double-prefix already tagged descriptions", () => {
		const items = regroupSlashSuggestions([
			{ value: "model", label: "/model", description: "[Builtin] pick model" },
		]);
		expect(items[0]?.description).toBe("[Builtin] pick model");
	});
});

describe("isSlashCommandCompletion", () => {
	it("detects /token without space", () => {
		expect(isSlashCommandCompletion(["/pl"], 0, 3)).toBe(true);
		expect(isSlashCommandCompletion(["/plan"], 0, 5)).toBe(true);
		expect(isSlashCommandCompletion(["hello /pl"], 0, 9)).toBe(true);
	});

	it("rejects after space or non-slash", () => {
		expect(isSlashCommandCompletion(["/plan "], 0, 6)).toBe(false);
		expect(isSlashCommandCompletion(["plan"], 0, 4)).toBe(false);
		expect(isSlashCommandCompletion([""], 0, 0)).toBe(false);
	});
});
