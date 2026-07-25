import { describe, expect, it } from "vitest";
import { ModeMutex } from "../src/mode/mutex.js";

describe("ModeMutex", () => {
	it("starts with all flags false", () => {
		const m = new ModeMutex();
		expect(m.snapshot()).toEqual({
			planActive: false,
			goalActive: false,
			pauseGoalRequested: false,
		});
	});

	it("allows starting goal when plan is inactive", () => {
		const m = new ModeMutex();
		expect(m.canStartGoal()).toEqual({ ok: true });
		m.setGoal(true);
		expect(m.snapshot().goalActive).toBe(true);
	});

	it("rejects starting goal while plan is active", () => {
		const m = new ModeMutex();
		m.setPlan(true);
		const gate = m.canStartGoal();
		expect(gate.ok).toBe(false);
		expect(gate.reason).toMatch(/plan/i);
	});

	it("entering plan while goal active requests pause", () => {
		const m = new ModeMutex();
		m.setGoal(true);
		const gate = m.canEnterPlan();
		expect(gate).toEqual({ ok: true, pauseGoal: true });
		expect(m.snapshot().pauseGoalRequested).toBe(true);
		m.setPlan(true);
		expect(m.snapshot()).toMatchObject({
			planActive: true,
			goalActive: true,
			pauseGoalRequested: true,
		});
	});

	it("setPlan(true) while goal active also sets pauseGoalRequested", () => {
		const m = new ModeMutex();
		m.setGoal(true);
		m.setPlan(true);
		expect(m.snapshot().pauseGoalRequested).toBe(true);
	});

	it("clearing goal clears pauseGoalRequested", () => {
		const m = new ModeMutex();
		m.setGoal(true);
		m.canEnterPlan();
		expect(m.snapshot().pauseGoalRequested).toBe(true);
		m.setGoal(false);
		expect(m.snapshot().pauseGoalRequested).toBe(false);
	});

	it("canEnterPlan without goal does not set pause", () => {
		const m = new ModeMutex();
		expect(m.canEnterPlan()).toEqual({ ok: true });
		expect(m.snapshot().pauseGoalRequested).toBe(false);
	});
});
