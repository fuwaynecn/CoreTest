import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { phase2Catalog } from "@/content/phase2-catalog";
import { createDatabase } from "./client";
import { seedDatabase } from "./seed";
import { seedE2eDatabase } from "../../scripts/seed-e2e";

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

// This is the only test that spawns subprocesses (two `node --import tsx src/db/seed.ts` runs), so the
// default 5s budget has no headroom when the whole suite runs with one worker per core.
test("seeds 216 reviewed templates plus the stable three-question Phase 1 daily pool idempotently", { timeout: 20_000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-valid-seed-"));
  const filename = join(directory, "seed.sqlite");
  const env = {
    ...process.env,
    DB_FILE_NAME: filename,
    PARENT_PASSWORD: "parent-password",
    CHILD_PIN: "2468",
  };

  try {
    const first = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(process.cwd(), "src/db/seed.ts")],
      { cwd: process.cwd(), encoding: "utf8", env },
    );
    const second = spawnSync(
      process.execPath,
      ["--import", "tsx", resolve(process.cwd(), "src/db/seed.ts")],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);

    const sqlite = new DatabaseSync(filename);
    try {
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM question_templates").get())
        .toEqual({ count: 219 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM skills").get())
        .toEqual({ count: 51 });
      expect(sqlite.prepare("SELECT name, domain FROM skills WHERE id = 'skill-decimal'").get())
        .toEqual({ name: "小数计算", domain: "数与运算" });
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM question_templates
        WHERE content_tier = 'transition'
      `).get()).toEqual({ count: 7 });
      expect(sqlite.prepare(`
        SELECT id, difficulty, common_errors AS commonErrors,
          reading_card AS readingCard, source, license_status AS licenseStatus
        FROM question_templates
        WHERE id IN ('q-decimal-1', 'q-reading-1', 'q-equation-1')
        ORDER BY CASE id
          WHEN 'q-decimal-1' THEN 1
          WHEN 'q-reading-1' THEN 2
          ELSE 3
        END
      `).all()).toEqual([
        { id: "q-decimal-1", difficulty: 1, commonErrors: "[\"calculation\"]", readingCard: 0, source: "original", licenseStatus: "owned" },
        { id: "q-reading-1", difficulty: 1, commonErrors: "[\"missing_unit\",\"incomplete_reading\"]", readingCard: 1, source: "original", licenseStatus: "owned" },
        { id: "q-equation-1", difficulty: 2, commonErrors: "[\"relationship\",\"calculation\"]", readingCard: 0, source: "original", licenseStatus: "owned" },
      ]);
      expect(sqlite.prepare(`
        SELECT common_errors AS commonErrors, reading_card AS readingCard,
          source, license_status AS licenseStatus
        FROM question_templates
        WHERE id = 'num-int-mental-01'
      `).get()).toEqual({
        commonErrors: JSON.stringify(["calculation", "range_check"]),
        readingCard: 0,
        source: "original",
        licenseStatus: "owned",
      });
      const readingMetadata = sqlite.prepare(`
        SELECT variant_spec AS variantSpec FROM question_templates WHERE id = 'habit-question-01'
      `).get() as { variantSpec: string };
      expect(JSON.parse(readingMetadata.variantSpec)).toMatchObject({
        errorTargets: { incompleteReading: ["A", "B", "D"] },
      });
    } finally {
      sqlite.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects an invalid catalog before opening a database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-invalid-catalog-"));
  const filename = join(directory, "seed.sqlite");
  const invalidCatalog = [phase2Catalog[0], phase2Catalog[0]];

  try {
    await expect(seedDatabase({
      catalog: invalidCatalog,
      parentPassword: "parent-password",
      childPin: "2468",
      openDatabase: () => createDatabase(filename),
    })).rejects.toThrow("Catalog validation failed");
    expect(existsSync(filename)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the E2E entry point rejects an invalid catalog before touching its database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-invalid-e2e-catalog-"));
  const filename = join(directory, ".tmp", "e2e.sqlite");

  try {
    await expect(seedE2eDatabase({
      catalog: [phase2Catalog[0], phase2Catalog[0]],
      parentPassword: "parent-password",
      childPin: "2468",
      workingDirectory: directory,
    })).rejects.toThrow("Catalog validation failed");
    expect(existsSync(filename)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
