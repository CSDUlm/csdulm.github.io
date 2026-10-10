import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPage } from "../site/render.mjs";
import {
  upcomingSeminars,
  timeLabel,
  dateLabel,
  escapeHTML,
  safeURL,
  calendarFile,
} from "../assets/js/seminars.mjs";
const content = JSON.parse(
  await readFile(new URL("../data/content.json", import.meta.url), "utf8"),
);
const db = JSON.parse(
  await readFile(new URL("../data/seminars.json", import.meta.url), "utf8"),
);
test("seminar archive has unique stable records and preserves missing historical precision", () => {
  assert.equal(db.version, 1);
  assert.equal(db.timezone, "Europe/Paris");
  assert.ok(Array.isArray(db.seminars));
  assert.equal(new Set(db.seminars.map((s) => s.id)).size, db.seminars.length);
  for (const s of db.seminars) {
    assert.ok(Number.isFinite(Date.parse(s.date)), s.id);
    if (s.timeKnown === false) assert.equal(s.date.length, 10, s.id);
    if (s.roomKnown === false)
      assert.ok(s.room === null || s.room === "Room W", s.id);
  }
});
test("upcoming selection handles Paris date-only records and timestamp offsets correctly", () => {
  const talks = [
    { id: "earlier", date: "2026-10-15T09:00:00Z" },
    { id: "later", date: "2026-10-22T11:00:00+02:00" },
    { id: "today", date: "2026-10-15", timeKnown: false },
  ];
  assert.deepEqual(
    upcomingSeminars(talks, Date.parse("2026-10-15T09:30:00Z")).map(
      (s) => s.id,
    ),
    ["today", "later"],
  );
  assert.deepEqual(
    upcomingSeminars(
      [{ date: "2026-01-01" }],
      Date.parse("2026-01-01T23:30:00Z"),
    ),
    [],
  );
  assert.equal(timeLabel(talks[2]), "");
  assert.equal(timeLabel(talks[1]), "11:00");
  assert.match(dateLabel({ date: "2026-04-02" }), /2 Apr 2026/);
});
test("English and French public pages expose translated navigation and safely escaped seminar content", () => {
  const malicious = {
    id: "future-test",
    speaker: "<script>bad()</script>",
    institution: "ENS",
    title: '<img onerror="bad()">',
    date: "2099-10-15T11:00:00+02:00",
    room: "Room W",
  };
  for (const lang of ["en", "fr"]) {
    const html = renderPage("home", lang, content, [malicious]);
    assert.ok(html.includes(`lang="${lang}"`));
    assert.ok(html.includes('hreflang="fr"'));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>bad()"));
    assert.ok(!html.includes('href="/rooms/'));
  }
  const html = renderPage("seminars", "fr", content, [
    malicious,
    { ...malicious, id: "later-test", date: "2099-11-15T11:00:00+01:00" },
  ]);
  assert.ok(html.includes('id="future-test"'));
  assert.ok(html.includes('id="later-test"'));
  assert.ok(html.includes("Rechercher un exposé"));
  assert.equal(safeURL("javascript:alert(1)"), "");
  assert.equal(safeURL("https://ens.psl.eu/"), "https://ens.psl.eu/");
  assert.equal(escapeHTML("<x>"), "&lt;x&gt;");
});
test("calendar export preserves actual start time and never invents a duration", () => {
  const file = calendarFile({
    id: "one",
    speaker: "A",
    title: "Talk, title",
    date: "2026-10-15T11:00:00+02:00",
    room: "Room W",
  });
  assert.ok(file.includes("DTSTART:20261015T090000Z"));
  assert.ok(file.includes("Talk\\, title"));
  assert.ok(!file.includes("DTEND"));
  const historic = calendarFile({
    id: "two",
    title: "Archive",
    date: "2026-04-02",
  });
  assert.ok(historic.includes("DTSTART;VALUE=DATE:20260402"));
});
test("tentative events remain labelled and cancelled events never become the next seminar", () => {
  const talk = {
    id: "tentative-test",
    speaker: "Nicolas Schreuder",
    institution: "",
    title: "Title not recorded",
    titleKnown: false,
    status: "tentative",
    date: "2099-10-15T11:00:00+02:00",
    room: "Room W",
    roomKnown: false,
  };
  const upcoming = upcomingSeminars(
    [
      talk,
      {
        ...talk,
        id: "cancelled-test",
        date: "2099-10-14T11:00:00+02:00",
        status: "cancelled",
      },
    ],
    Date.parse("2099-10-10T12:00:00+02:00"),
  );
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].status, "tentative");
  assert.equal(timeLabel(upcoming[0]), "11:00");
  assert.deepEqual(
    upcomingSeminars([{ date: "2099-10-15", status: "cancelled" }]),
    [],
  );
  const html = renderPage("home", "en", content, [talk]);
  assert.ok(html.includes("To be confirmed"));
  assert.ok(html.includes("Title to be announced"));
  assert.ok(html.includes("Room W (default room)"));
});
