import { describe, it, expect } from "bun:test";
import {
  shouldInject,
  structuralScore,
  countFailures,
  findSkillLoadIndex,
  INJECTION_MARKER,
  INJECTION_TEXT,
  type ChatMessage,
} from "../scripts/router-heuristics";

const user = (text: string): ChatMessage => ({ role: "user", content: text });
const toolErr = (): ChatMessage => ({
  role: "tool",
  content: [{ type: "text", text: "Error: command exited with code 1\nFAIL tests/foo.test.ts" }],
});
const assistant = (text: string): ChatMessage => ({ role: "assistant", content: text });

describe("structuralScore", () => {
  it("scores parallel-option contrast", () => {
    expect(structuralScore("should I use Redis or SQLite for this?")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("React vs Vue for the dashboard")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("方案A跟方案B哪個比較好")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("這兩種寫法該怎麼挑")).toBeGreaterThanOrEqual(1);
  });
  it("scores open-ended question shapes", () => {
    expect(structuralScore("how should I structure this service?")).toBeGreaterThanOrEqual(1);
    expect(structuralScore("幫我看看這個架構有什麼問題")).toBeGreaterThanOrEqual(1);
  });
  it("scores multi-file references", () => {
    expect(structuralScore("compare src/a.ts and src/b.ts")).toBeGreaterThanOrEqual(1);
  });
  it("scores zero on flat imperatives", () => {
    expect(structuralScore("fix the typo in README.md")).toBe(0);
    expect(structuralScore("run the tests")).toBe(0);
  });
});

describe("countFailures", () => {
  it("counts error-bearing messages after the given index", () => {
    const msgs = [user("hi"), toolErr(), assistant("retry"), toolErr()];
    expect(countFailures(msgs, -1)).toBe(2);
    expect(countFailures(msgs, 1)).toBe(1);
  });
  it("ignores non-error content", () => {
    const msgs = [user("hi"), assistant("all tests passed")];
    expect(countFailures(msgs, -1)).toBe(0);
  });
});

describe("findSkillLoadIndex", () => {
  it("finds the last message containing the marker", () => {
    const msgs = [user("a"), user(INJECTION_MARKER), user("b"), user(INJECTION_MARKER)];
    expect(findSkillLoadIndex(msgs, INJECTION_MARKER)).toBe(3);
  });
  it("returns -1 when absent", () => {
    expect(findSkillLoadIndex([user("x")], INJECTION_MARKER)).toBe(-1);
  });
});

describe("shouldInject", () => {
  it("injects on structural signals in the last user message", () => {
    const msgs = [user("which approach is better, caching or memoization?")];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(true);
  });
  it("injects on >=2 failures since last skill load", () => {
    const msgs = [user("fix it"), toolErr(), toolErr()];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(true);
  });
  it("resets the failure window after a skill load", () => {
    const msgs = [user("fix it"), toolErr(), user(INJECTION_TEXT), toolErr()];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(false);
  });
  it("is idempotent when injection marker already present", () => {
    const msgs = [user("A or B?"), user(INJECTION_TEXT)];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(false);
  });
  it("does not inject on flat input with no failures", () => {
    const msgs = [user("rename the variable")];
    expect(shouldInject(msgs, { marker: INJECTION_MARKER }).inject).toBe(false);
  });
  it("reports a human-readable reason", () => {
    const r = shouldInject([user("A vs B?")], { marker: INJECTION_MARKER });
    expect(r.reason.length).toBeGreaterThan(0);
  });
  it("injects on short debug/root-cause triggers", () => {
    for (const t of ["Debug", "怎麼老是有bug ?", "system crashed, root cause?"]) {
      const r = shouldInject([{ role: "user", content: t }], { marker: INJECTION_MARKER });
      expect(r.inject).toBe(true);
    }
  });
});
