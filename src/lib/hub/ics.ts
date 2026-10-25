import type { DateOption } from "../types";
import { resolveDate, toMin } from "./schedule";

// Calendar invite (§7.5). Tempe is America/Phoenix: UTC-7 all year (no DST), so UTC conversion is exact.

const PHOENIX_OFFSET_MIN = 7 * 60;
export const ICS_TITLE = "Prelude date ☕";
export const DATE_LENGTH_MIN = 90;

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (Buffer.byteLength(current + ch, "utf8") > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function startUtc(option: DateOption, now = new Date()): Date {
  const date = option.date ?? resolveDate(option.day as never, now);
  const [y, m, d] = date.split("-").map(Number);
  const mins = toMin(option.start) + PHOENIX_OFFSET_MIN;
  return new Date(Date.UTC(y, m - 1, d, 0, mins));
}

export function buildIcs(option: DateOption, opts: { uid: string; description?: string; now?: Date }): string {
  const now = opts.now ?? new Date();
  const start = startUtc(option, now);
  const end = new Date(start.getTime() + DATE_LENGTH_MIN * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prelude//Agent-planned dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@prelude.local`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(ICS_TITLE)}`,
    `LOCATION:${escapeText(`${option.place}, ${option.area}, Tempe, AZ`)}`,
    `DESCRIPTION:${escapeText(opts.description ?? `Planned by your Prelude agents. ${option.why}. ${/^free$/i.test(option.estCostPerPerson) ? "Free." : `Est. ${option.estCostPerPerson} per person.`} Public place: tell a friend where you'll be.`)}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(ICS_TITLE)} in 1 hour`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
