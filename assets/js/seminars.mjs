export const TIMEZONE = "Europe/Paris";
export function seminarInstant(seminar) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(seminar.date))
    return Date.parse(`${seminar.date}T12:00:00Z`);
  return Date.parse(seminar.date);
}
export function sortSeminars(seminars) {
  return [...seminars].sort((a, b) => seminarInstant(b) - seminarInstant(a));
}
export function upcomingSeminars(seminars, now = Date.now()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return seminars
    .filter(
      (s) =>
        s.status !== "cancelled" &&
        (s.date.length === 10 ? s.date >= day : seminarInstant(s) >= now),
    )
    .sort((a, b) => seminarInstant(a) - seminarInstant(b));
}
export function escapeHTML(value = "") {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function dateLabel(seminar, lang = "en", opts = {}) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(
    new Date(
      seminar.date.length === 10 ? `${seminar.date}T12:00:00Z` : seminar.date,
    ),
  );
}
export function timeLabel(seminar, lang = "en") {
  if (seminar.timeKnown === false || seminar.date.length === 10) return "";
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(seminar.date));
}
export function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function calendarFile(s) {
  const escape = (s) =>
    String(s ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const instant = new Date(s.date);
  const stamp = (d) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const start =
    s.date.length === 10
      ? `DTSTART;VALUE=DATE:${s.date.replace(/-/g, "")}`
      : `DTSTART:${stamp(instant)}`;
  const description = [s.speaker, s.institution, s.abstract]
    .filter(Boolean)
    .join("\n");
  const title =
    s.titleKnown === false
      ? `CSD seminar — ${s.speaker || "title to be announced"}`
      : s.title;
  const status =
    s.status === "tentative"
      ? "STATUS:TENTATIVE\r\n"
      : s.status === "cancelled"
        ? "STATUS:CANCELLED\r\n"
        : "";
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CSD ENS//Seminars//EN\r\nBEGIN:VEVENT\r\nUID:${escape(s.id)}@csdulm.github.io\r\nDTSTAMP:${stamp(new Date())}\r\n${start}\r\nSUMMARY:${escape(title)}\r\n${status}DESCRIPTION:${escape(description)}\r\nLOCATION:${escape(s.room || "CSD, 45 rue d’Ulm, Paris")}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}
