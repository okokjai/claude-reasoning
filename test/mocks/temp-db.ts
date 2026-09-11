// test/mocks/temp-db.ts
// SQLite checkpoint stores are shared between `reason()` and `resume()` so a
// thread stays resumable. Tests therefore must NOT use the shared default path:
// a leftover checkpoint for a reused thread_id would make `reason()` replay a
// finished run instead of exercising the fresh path. Each test that needs a
// durable store gets a private temp directory.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDb {
  dbPath: string;
  cleanup: () => void;
}

// SqliteSaver keeps the DB file open for the process lifetime, so Windows
// refuses removal while the handle lives. Cleanup is best-effort retry; the OS
// reclaims any leftover temp dir.
export function tempDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), "cr-test-"));
  return {
    dbPath: join(dir, "checkpoints.sqlite"),
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        /* file still held by the checkpoint saver */
      }
    },
  };
}
