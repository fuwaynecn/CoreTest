import { describe, expect, it } from "vitest";
import { addShanghaiDays, shanghaiDateKey, shanghaiWeekKey } from "./shanghai-calendar";

describe("Shanghai learning calendar", () => {
  it("uses Shanghai midnight and Monday week boundaries", () => {
    expect(shanghaiDateKey(new Date("2026-08-19T15:59:59Z"))).toBe("2026-08-19");
    expect(shanghaiDateKey(new Date("2026-08-19T16:00:00Z"))).toBe("2026-08-20");
    expect(shanghaiWeekKey(new Date("2026-08-23T15:59:59Z"))).toBe("2026-08-17");
    expect(shanghaiWeekKey(new Date("2026-08-23T16:00:00Z"))).toBe("2026-08-24");
    expect(addShanghaiDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
