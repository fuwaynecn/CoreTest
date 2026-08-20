type DateInput = Date | number;

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKeyAtUtcNoon(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shanghaiDateKey(input: DateInput = new Date()) {
  const parts = shanghaiDateFormatter.formatToParts(new Date(input));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addShanghaiDays(dateKey: string, days: number) {
  const date = dateKeyAtUtcNoon(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateKey(date);
}

export function shanghaiWeekKey(input: DateInput = new Date()) {
  const date = dateKeyAtUtcNoon(shanghaiDateKey(input));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return utcDateKey(date);
}
