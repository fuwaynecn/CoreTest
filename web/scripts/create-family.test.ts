import { createTestDatabase } from "@/test/test-db";
import { createFamilyParent } from "./create-family";

describe("createFamilyParent", () => {
  it("创建普通家长（非管理员），登录名唯一", async () => {
    const db = createTestDatabase();
    const id = await createFamilyParent(db, { loginName: "fam1", displayName: "一号家庭", password: "parent-pass" });
    expect(typeof id).toBe("string");
    const row = db.all("SELECT is_admin, role, parent_id, grade, edition FROM users WHERE login_name='fam1'")[0] as Record<string, unknown>;
    expect(row).toMatchObject({ role: "parent", is_admin: 0, parent_id: null, grade: null, edition: "pep" });
    const hash = db.all("SELECT credential_hash FROM users WHERE login_name='fam1'")[0] as Record<string, string>;
    expect(hash.credential_hash).toMatch(/^scrypt:/);
  });

  it("登录名重复抛错，且不产生新行", async () => {
    const db = createTestDatabase();
    await createFamilyParent(db, { loginName: "fam1", displayName: "x", password: "parent-pass" });
    await expect(createFamilyParent(db, { loginName: "fam1", displayName: "y", password: "parent-pass2" }))
      .rejects.toThrow("登录名已被使用");
    expect(db.all("SELECT COUNT(*) AS n FROM users")[0]).toMatchObject({ n: 1 });
  });
});
