import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("importing the test database factory does not create the default database", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "math-trainer-"));
  const filename = path.join(directory, "data", "math-trainer.sqlite");
  const originalFilename = process.env.DB_FILE_NAME;

  process.env.DB_FILE_NAME = filename;
  vi.resetModules();

  try {
    await import("@/test/test-db");

    expect(existsSync(filename)).toBe(false);
  } finally {
    const client = await import("@/db/client") as unknown as { db?: { $client: { close(): void } } };
    client.db?.$client.close();
    if (originalFilename === undefined) delete process.env.DB_FILE_NAME;
    else process.env.DB_FILE_NAME = originalFilename;
    rmSync(directory, { recursive: true, force: true });
  }
});
