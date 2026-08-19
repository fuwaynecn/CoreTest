import { users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

test("stores one parent and one child", () => {
  const db = createTestDatabase();
  db.insert(users).values([
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "hash-a", createdAt: 1 },
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash-b", createdAt: 1 },
  ]).run();

  expect(db.select().from(users).all().map((row) => row.role).sort()).toEqual(["child", "parent"]);
});
