import { kvGet, kvSet } from "@/lib/kvStorage";

export type ClassScheduleItem = {
  id: string;
  subjectCode: string;
  subject: string;
  days: string[];
  time: string;
  /** Legacy display fields are kept when reading older saved schedules. */
  title?: string;
  day?: string;
  location?: string;
  routeHint?: string;
};

const CLASS_SCHEDULES_KEY = "tara:classSchedules";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export function normalizeScheduleTime(
  value: string,
  meridiem: "AM" | "PM"
): string | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "00");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  let hours24 = hour % 12;
  if (meridiem === "PM") hours24 += 12;
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
    const subject = parts.slice(2).join(" ") || "Class";

    items.push({
      id: `${subject}-${day}-${time}-${items.length}`,
      subjectCode: "",
      subject: subject.replace(/\s+at\s+.*$/i, ""),
      days: [day],
      time: normalizeTimeValue(time),
      routeHint: "Recommended based on this class time.",
    });
  }

  return items;
}

export async function loadClassSchedules(
  accountSchedules?: unknown
): Promise<ClassScheduleItem[]> {
  if (Array.isArray(accountSchedules) && accountSchedules.length) {
    return normalizeLoadedSchedules(accountSchedules);
  }

  const raw = await kvGet(CLASS_SCHEDULES_KEY);
  {
    if (!raw) return [];
    try {
      const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Array<
        Partial<ClassScheduleItem> & { title?: string; day?: string }
      >;
      if (!Array.isArray(parsed) || !parsed.length) return [];
      return normalizeLoadedSchedules(parsed);
    } catch {
      return [];
    }
  }
}

function normalizeLoadedSchedules(
  parsed: Array<Partial<ClassScheduleItem> & { title?: string; day?: string }>
): ClassScheduleItem[] {
  return parsed.map((item, index) => {
        const subject = item.subject?.trim() || item.title?.trim() || "Class";
        const days = Array.isArray(item.days)
          ? item.days.filter((day): day is string => typeof day === "string")
          : item.day
            ? [item.day]
            : ["Mon"];
        return {
          id: item.id || `${subject}-${index}`,
          subjectCode: item.subjectCode?.trim() || "",
          subject,
          days,
          time: normalizeTimeValue(item.time || "08:00"),
          routeHint: item.routeHint,
        };
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
      const scheduleDays =
        item.days?.length
          ? item.days
          : item.day
            ? [item.day]
            : [];
      const sameDay = scheduleDays.some(
        (day) => day.slice(0, 3).toLowerCase() === todayName.toLowerCase()
      );
      if (!sameDay) {
        const todayIndex = DAY_NAMES.indexOf(todayName);
        const offsets = scheduleDays
          .map((day) => DAY_NAMES.indexOf(day.slice(0, 3).replace(/^./, (c) => c.toUpperCase())))
          .filter((index) => index >= 0)
          .map((index) => (index - todayIndex + 7) % 7 || 7);
        dayOffset = offsets.length ? Math.min(...offsets) : 7;
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

  // When the next class is close, arrival time matters more than fare.
  if (targetMinutes <= 90) {
    return [...items].sort(
      (a, b) =>
        (a.etaMinutes ?? Number.POSITIVE_INFINITY) -
        (b.etaMinutes ?? Number.POSITIVE_INFINITY)
    );
  }

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
