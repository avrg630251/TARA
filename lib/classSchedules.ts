import { kvGet, kvSet } from "@/lib/kvStorage";

export type ClassScheduleItem = {
  id: string;
  title: string;
  day: string;
  time: string;
  location: string;
  routeHint?: string;
};

const CLASS_SCHEDULES_KEY = "tara:classSchedules";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_CLASS_SCHEDULES: ClassScheduleItem[] = [
  {
    id: "default-math-730",
    title: "Math 101",
    day: "Mon",
    time: "07:30",
    location: "Main Campus Building A",
    routeHint: "Leave early for the morning commute.",
  },
  {
    id: "default-english-930",
    title: "English 201",
    day: "Tue",
    time: "09:30",
    location: "Arts and Sciences Hall",
    routeHint: "Take the direct route before class time.",
  },
];

function normalizeTimeValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "08:00";
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p)?\s*(m)?$/i);
  if (!match) return "08:00";
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = (match[3] ?? "").toLowerCase();
  const isPm = meridiem === "p" || match[4]?.toLowerCase() === "pm";
  if (hours === 12) hours = isPm ? 12 : 0;
  else if (isPm) hours += 12;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatTimeDisplay(value: string): string {
  const normalized = normalizeTimeValue(value);
  const [hours, minutes] = normalized.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function toMinutes(value: string): number {
  const normalized = normalizeTimeValue(value);
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

export function parseClassScheduleText(raw: string): ClassScheduleItem[] {
  const entries = raw
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ClassScheduleItem[] = [];
  for (const entry of entries) {
    const parts = entry
      .split(/\s*[-–]\s*|\s*\|\s*|\s*,\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 3) continue;

    const day = parts[0].replace(/\.$/, "");
    const time = parts[1];
    const title = parts.slice(2).join(" ") || "Class";
    const location = title.includes(" at ") ? title.split(/\s+at\s+/i)[1] ?? "" : "";

    items.push({
      id: `${title}-${day}-${time}-${items.length}`,
      title: title.replace(/\s+at\s+.*$/i, ""),
      day,
      time: normalizeTimeValue(time),
      location: location || "Campus",
      routeHint: "Recommended based on this class time.",
    });
  }

  return items;
}

export function loadClassSchedules(): Promise<ClassScheduleItem[]> {
  return kvGet(CLASS_SCHEDULES_KEY).then((raw) => {
    if (!raw) return DEFAULT_CLASS_SCHEDULES;
    try {
      const parsed = JSON.parse(raw) as ClassScheduleItem[];
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_CLASS_SCHEDULES;
    } catch {
      return DEFAULT_CLASS_SCHEDULES;
    }
  });
}

export async function saveClassSchedules(items: ClassScheduleItem[]): Promise<void> {
  await kvSet(CLASS_SCHEDULES_KEY, JSON.stringify(items));
}

export function getNextClassInfo(
  items: ClassScheduleItem[],
  now = new Date()
): { item: ClassScheduleItem | null; minutesUntil: number | null } {
  if (!items.length) return { item: null, minutesUntil: null };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayName = DAY_NAMES[now.getDay()];

  const candidates = items
    .map((item) => {
      let dayOffset = 0;
      const sameDay = item.day.toLowerCase() === todayName.toLowerCase();
      if (!sameDay) {
        const weekdayIndex = DAY_NAMES.indexOf(item.day.slice(0, 3).charAt(0).toUpperCase() + item.day.slice(1, 3).toLowerCase());
        const todayIndex = DAY_NAMES.indexOf(todayName);
        if (weekdayIndex >= 0 && todayIndex >= 0) {
          dayOffset = (weekdayIndex - todayIndex + 7) % 7;
          if (dayOffset === 0) dayOffset = 7;
        } else {
          dayOffset = 7;
        }
      }

      const classMinutes = toMinutes(item.time);
      const currentMinutes = nowMinutes + dayOffset * 24 * 60;
      const minutesUntil = classMinutes - nowMinutes + dayOffset * 24 * 60;
      const shouldUseFuture = sameDay ? minutesUntil >= 0 : true;
      return {
        item,
        dayOffset,
        minutesUntil: shouldUseFuture ? minutesUntil : Number.POSITIVE_INFINITY,
        currentMinutes,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.minutesUntil))
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  if (!candidates.length) {
    return { item: items[0], minutesUntil: null };
  }

  const nearest = candidates[0];
  const minutesUntil = nearest.minutesUntil;
  return {
    item: nearest.item,
    minutesUntil: minutesUntil,
  };
}

export function sortRoutesForSchedule<T extends { etaMinutes?: number | null }>(
  items: T[],
  schedules: ClassScheduleItem[],
  now = new Date()
): T[] {
  if (!schedules.length) return items;
  const nextClass = getNextClassInfo(schedules, now);
  const targetMinutes = nextClass.minutesUntil ?? 60;

  return [...items].sort((a, b) => {
    const aEta = a.etaMinutes ?? Number.POSITIVE_INFINITY;
    const bEta = b.etaMinutes ?? Number.POSITIVE_INFINITY;
    const aDistance = Math.abs(aEta - targetMinutes);
    const bDistance = Math.abs(bEta - targetMinutes);
    const aLatePenalty = aEta > targetMinutes ? 60 : 0;
    const bLatePenalty = bEta > targetMinutes ? 60 : 0;
    return aDistance + aLatePenalty - (bDistance + bLatePenalty);
  });
}
