import { describe, expect, it } from "vitest";
import { compareSemverIsh, runDoctorChecks } from "../src/commands/doctor.js";

describe("compareSemverIsh", () => {
	it("compares dotted numeric versions", () => {
		expect(compareSemverIsh("0.80.6", "0.80.6")).toBe(0);
		expect(compareSemverIsh("0.80.5", "0.80.6")).toBe(-1);
		expect(compareSemverIsh("0.81.0", "0.80.6")).toBe(1);
		expect(compareSemverIsh("v0.82.0", "0.80.6")).toBe(1);
	});
});

describe("runDoctorChecks", () => {
	const base = {
		minPiVersion: "0.80.6",
		loadedExtensionPaths: [] as string[],
		commands: ["plan", "goal", "btw", "cleanup", "todos"],
	};

	it("passes with healthy input", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: [
				"/app/node_modules/@narumitw/pi-plan-mode/src/index.ts",
				"/app/node_modules/@narumitw/pi-goal/src/index.ts",
				"/app/node_modules/@juicesharp/rpiv-btw/index.ts",
				"/app/node_modules/pi-subagents/index.ts",
			],
		});
		expect(report.ok).toBe(true);
		expect(report.errors).toHaveLength(0);
	});

	it("errors when Pi version is too low", () => {
		const report = runDoctorChecks({ ...base, piVersion: "0.79.0" });
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => e.includes("0.79.0"))).toBe(true);
	});

	it("downgrades version error to warning with force", () => {
		const report = runDoctorChecks({ ...base, piVersion: "0.79.0", force: true });
		expect(report.ok).toBe(true);
		expect(report.warnings.some((w) => w.includes("0.79.0"))).toBe(true);
	});

	it("detects pi-btw + rpiv-btw conflict", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: [
				"/x/node_modules/@narumitw/pi-btw/index.ts",
				"/x/node_modules/@juicesharp/rpiv-btw/index.ts",
			],
		});
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /btw/i.test(e))).toBe(true);
	});

	it("detects nicobailon + narumitw subagents conflict", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: [
				"/x/node_modules/pi-subagents/index.ts",
				"/x/node_modules/@narumitw/pi-subagents/index.ts",
			],
		});
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /subagents/i.test(e))).toBe(true);
	});

	it("does not flag narumitw pi-subagents alone as a dual-subagents conflict", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: ["/x/node_modules/@narumitw/pi-subagents/index.ts"],
		});
		expect(report.errors.some((e) => /subagents/i.test(e))).toBe(false);
	});

	it("detects oh-my-pi paths", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: ["/opt/oh-my-pi/packages/coding-agent/ext.ts"],
		});
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /oh-my-pi/i.test(e))).toBe(true);
	});

	it("detects duplicate goal packages and duplicate /goal commands", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: [
				"/a/node_modules/@narumitw/pi-goal/src/index.ts",
				"/b/vendor/other-pi-goal/src/index.ts",
			],
			commands: ["plan", "goal", "goal:1", "btw", "cleanup", "todo"],
		});
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /goal/i.test(e))).toBe(true);
	});

	it("warns on missing expected commands", () => {
		const report = runDoctorChecks({
			minPiVersion: "0.80.6",
			piVersion: "0.82.0",
			loadedExtensionPaths: [],
			commands: ["model"],
		});
		expect(report.ok).toBe(true);
		expect(report.warnings.some((w) => w.includes("/plan"))).toBe(true);
		expect(report.warnings.some((w) => /todo/i.test(w))).toBe(true);
	});

	it("accepts /todo as well as /todos", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			commands: ["plan", "goal", "btw", "cleanup", "todo"],
		});
		expect(report.info.some((i) => i.includes("/todo"))).toBe(true);
	});

	it("detects statusline + starship conflict", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: [
				"/x/node_modules/@narumitw/pi-statusline/src/index.ts",
				"/x/node_modules/@narumitw/pi-starship/src/index.ts",
			],
		});
		expect(report.ok).toBe(false);
		expect(report.errors.some((e) => /statusline|starship/i.test(e))).toBe(true);
	});

	it("notes statusline and retry when present alone", () => {
		const report = runDoctorChecks({
			...base,
			piVersion: "0.82.0",
			loadedExtensionPaths: [
				"/x/node_modules/@narumitw/pi-statusline/src/index.ts",
				"/x/node_modules/@narumitw/pi-retry/src/index.ts",
			],
		});
		expect(report.ok).toBe(true);
		expect(report.info.some((i) => i.includes("pi-statusline"))).toBe(true);
		expect(report.info.some((i) => i.includes("pi-retry"))).toBe(true);
	});
});
