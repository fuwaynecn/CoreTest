import { users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
const state = vi.hoisted(() => ({ db: undefined as unknown, user: { id: "parent", role: "parent", displayName: "家长" } as unknown }));
vi.mock("@/db/client", async (original) => ({ ...(await original<typeof import("@/db/client")>()), getDatabase: () => state.db }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => state.user }));
import { POST } from "./route";
test("refuses to update an arbitrary child when multiple children exist", async () => {
  const db = createTestDatabase(); state.db = db;
  db.insert(users).values([{ id: "child-a", role: "child", displayName: "甲", credentialHash: "hash", createdAt: 1 }, { id: "child-b", role: "child", displayName: "乙", credentialHash: "hash", createdAt: 1 }]).run();
  const response = await POST(new Request("http://localhost/api/parent/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "none" }) }));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "ambiguous_child" } });
});
