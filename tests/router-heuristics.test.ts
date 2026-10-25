import { describe, it, expect } from "bun:test";
import {
  shouldInject,
  lastUserText,
  messageText,
  INJECTION_MARKER,
  INJECTION_TEXT,
  EXPLICIT_REQUEST_RE,
  type ChatMessage,
} from "../scripts/router-heuristics";

const user = (text: string): ChatMessage => ({ role: "user", content: text });
const userParts = (text: string): ChatMessage => ({ role: "user", content: [{ type: "text", text }] });
const toolErr = (): ChatMessage => ({
  role: "toolResult",
  content: [{ type: "text", text: "Error: command exited with code 1\nFAIL tests/foo.test.ts" }],
});
const assistant = (text: string): ChatMessage => ({ role: "assistant", content: text });

const injects = (msgs: ChatMessage[]): boolean => shouldInject(msgs).inject;

describe("explicit opt-in fires", () => {
  const optingIn = [
    "use claude-reasoning",
    "please run the claude reasoning skill",
    "用 claude-reasoning 分析這個架構",
    "請使用 claude-reasoning",
    "指定用 claude reasoning skill",
    "啟用 claude-reasoning",
    "改用 claude_reasoning",
    "read skill://claude-reasoning first",
  ];
  for (const text of optingIn) {
    it(`fires on: ${text}`, () => {
      expect(injects([user(text)])).toBe(true);
    });
  }

  it("fires when the request is in an array-of-parts message", () => {
    expect(injects([userParts("use claude-reasoning for this")])).toBe(true);
  });

  it("fires mid-session, not only on the first turn", () => {
    const msgs = [user("rename the variable"), assistant("done"), toolErr(), user("now use claude-reasoning")];
    expect(injects(msgs)).toBe(true);
  });

  it("fires when the last user turn opted in, even if a tool result followed", () => {
    expect(injects([user("use claude-reasoning"), toolErr()])).toBe(true);
  });
});

describe("never fires without an explicit designation", () => {
  const mustStayQuiet = [
    // the prompts that actually misfired
    "都是路由問題 問了新session 用了claude reasoning path b : systematic-debugging",
    "路由問題根治方案 Debug gate 判定（第五次，同一來源誤報）問題 fix bug 老是用claude reasoning skill !?",
    "請只讀取檔案進行調查，絕對不要修改任何程式碼。請幫我並行查出以下資訊：完整稽核。並行掃描所有文件、交叉比對計數與範例 diff 要親自驗證行為",
    "錯誤根源在哪個檔案、第幾行？造成這個問題的原因是什麼？提供具體、最小範圍的修復建議與測試方式",
    // ordinary work
    "rename the variable",
    "修正 README 的錯字，順便調整標題",
    "對齊這段縮排",
    "比對兩個檔案的內容",
    "新增一個該功能的選項",
    "該檔案需要修正",
    "move the file or directory to backups",
    "run the test or skip it",
    "yes or no",
    "bump version 3.3.3 to 3.3.4",
    "check node 20.11.1 please",
    "fix bug in README typo",
    "更新 CHANGELOG 條目",
    "把 compareAll 改名成 diffAll",
    "跑一下測試然後把結果貼給我",
    // genuine decision shapes — still not a skill designation
    "Redis vs SQLite for the cache?",
    "該選 Postgres 還是 SQLite",
    "A 跟 B 哪個比較好",
    "what are the tradeoffs?",
    "compare src/a.ts and src/b.ts",
    // bare mention without an opting verb
    "claude-reasoning 這個 skill 有點吵",
    "the claude reasoning gate misfires a lot",
  ];
  for (const text of mustStayQuiet) {
    it(`stays quiet on: ${text.slice(0, 48)}`, () => {
      expect(injects([user(text)])).toBe(false);
    });
  }

  it("stays quiet on a session full of tool failures", () => {
    const msgs = [user("fix it"), toolErr(), toolErr(), toolErr(), assistant("error: boom"), toolErr()];
    expect(injects(msgs)).toBe(false);
  });

  it("stays quiet once the directive is already in the transcript (marker idempotency)", () => {
    const msgs = [user("use claude-reasoning"), user(INJECTION_TEXT)];
    expect(injects(msgs)).toBe(false);
  });

  it("stays quiet on an empty history", () => {
    expect(injects([])).toBe(false);
  });
});

describe("lastUserText", () => {
  it("returns the most recent user turn", () => {
    expect(lastUserText([user("first"), assistant("a"), user("second")])).toBe("second");
  });

  it("skips its own injected directive so it is never mistaken for user intent", () => {
    const msgs = [user("real intent"), user(INJECTION_TEXT)];
    expect(lastUserText(msgs)).toBe("real intent");
  });

  it("returns an empty string when there is no user turn", () => {
    expect(lastUserText([assistant("hello")])).toBe("");
  });
});

describe("messageText", () => {
  it("handles string content", () => {
    expect(messageText({ role: "user", content: "abc" })).toBe("abc");
  });
  it("joins text parts and ignores non-text parts", () => {
    expect(messageText({ role: "user", content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] })).toBe("a\nb");
  });
  it("returns an empty string for missing content", () => {
    expect(messageText({ role: "user" })).toBe("");
  });
});

describe("EXPLICIT_REQUEST_RE", () => {
  it("accepts hyphen, underscore and space spellings", () => {
    for (const s of ["claude-reasoning", "claude_reasoning", "claude reasoning"]) {
      expect(EXPLICIT_REQUEST_RE.test(`use ${s}`)).toBe(true);
    }
  });
  it("is case-insensitive", () => {
    expect(EXPLICIT_REQUEST_RE.test("USE Claude-Reasoning")).toBe(true);
  });
});

describe("injection text", () => {
  it("carries the marker so the directive is identifiable", () => {
    expect(INJECTION_TEXT).toContain(INJECTION_MARKER);
    expect(INJECTION_TEXT).toContain("skill://claude-reasoning");
  });
});
