import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test.each([
  { parentPassword: "123", childPin: "2468" },
  { parentPassword: "parent-password", childPin: "9".repeat(129) },
])("rejects out-of-range seed credentials before creating the database", ({
  parentPassword,
  childPin,
}) => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-invalid-seed-"));
  const filename = join(directory, "seed.sqlite");

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(process.cwd(), "src/db/seed.ts")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DB_FILE_NAME: filename,
          PARENT_PASSWORD: parentPassword,
          CHILD_PIN: childPin,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("4-128");
    expect(existsSync(filename)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
