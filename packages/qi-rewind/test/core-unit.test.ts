import { describe, expect, it } from "vitest";
import {
  isSafeId,
  sanitizeForRef,
  shouldIgnoreForSnapshot,
  MUTATING_TOOLS,
  findClosestCheckpoint,
  type CheckpointData,
} from "../src/core.js";

describe("qi-rewind core helpers", () => {
  it("isSafeId accepts valid ids", () => {
    expect(isSafeId("abc-123")).toBe(true);
    expect(isSafeId("../evil")).toBe(false);
  });

  it("sanitizeForRef cleans special characters", () => {
    expect(sanitizeForRef("hello world!")).not.toMatch(/[! ]/);
  });

  it("shouldIgnoreForSnapshot filters known dirs", () => {
    expect(shouldIgnoreForSnapshot("node_modules/x")).toBe(true);
    expect(shouldIgnoreForSnapshot("src/index.ts")).toBe(false);
  });

  it("MUTATING_TOOLS includes write/edit/bash", () => {
    expect(MUTATING_TOOLS.has("write")).toBe(true);
    expect(MUTATING_TOOLS.has("edit")).toBe(true);
    expect(MUTATING_TOOLS.has("bash")).toBe(true);
  });

  it("findClosestCheckpoint picks nearest prior", () => {
    const cps = [
      { id: "a", timestamp: 100 },
      { id: "b", timestamp: 200 },
      { id: "c", timestamp: 300 },
    ] as CheckpointData[];
    expect(findClosestCheckpoint(cps, 250)?.id).toBe("b");
    expect(findClosestCheckpoint([], 100)).toBeUndefined();
  });
});
