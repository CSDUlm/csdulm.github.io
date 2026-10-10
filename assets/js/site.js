import { strings } from "./strings.mjs";
import {
  sortSeminars,
  upcomingSeminars,
  dateLabel,
  timeLabel,
  safeURL,
  calendarFile,
} from "./seminars.mjs";
const lang = document.documentElement.lang === "fr" ? "fr" : "en",
  t = strings[lang];
const menu = document.querySelector(".nav-toggle"),
  nav = document.querySelector(".nav");
menu?.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("open", open);
});
nav?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    nav.classList.remove("open");
    menu.setAttribute("aria-expanded", "false");
    menu.focus();
  }
});
const next = document.getElementById("next-seminar"),
  upcomingList = document.getElementById("upcoming-list"),
  list = document.getElementById("seminar-list");
const node = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};
const roomLabel = (s) =>
  s.room
    ? s.roomKnown === false
      ? `${s.room} (${t.defaultRoom})`
      : s.room
    : "";
let programme = [],
  limit = 30;
function renderNext() {
  const coming = upcomingSeminars(programme);
  if (upcomingList && coming.length) {
    const rows = node("div", "seminar-list");
    rows.append(...coming.map(renderRow));
    upcomingList.replaceChildren(rows);
  }
  const s = coming[0];
  if (!next && (!upcomingList || s)) return;
  const feature = node("div", `seminar-feature${s ? "" : " empty"}`);
  if (!s) {
    const empty = node("div", "empty-seminar"),
      copy = node("div");
    copy.append(node("h3", "", t.noneTitle), node("p", "", t.noneBody));
    const a = node("a", "text-link", `${t.archiveLink} →`);
    a.href = `${lang === "fr" ? "/fr" : ""}/seminars/`;
    empty.append(copy, a);
    feature.append(empty);
  } else {
    const date = node(
      "div",
      "seminar-date",
      dateLabel(s, lang, { year: undefined }),
    );
    date.append(
      node(
        "span",
        "",
        [timeLabel(s, lang), roomLabel(s)].filter(Boolean).join(" · "),
      ),
    );
    const content = node("div");
    content.append(
      node(
        "div",
        "eyebrow",
        `${t.nextLabel}${s.status === "tentative" ? ` · ${t.tentative}` : ""}`,
      ),
      node("h3", "", s.titleKnown === false ? t.titlePending : s.title),
      node("p", "", [s.speaker, s.institution].filter(Boolean).join(" · ")),
    );
    const a = node("a", "text-link", `${t.seminarLink} →`);
    a.href = `${lang === "fr" ? "/fr" : ""}/seminars/#${encodeURIComponent(s.id)}`;
    content.append(a);
    if (s.date.length > 10) {
      const button = node("button", "button secondary", t.calendar);
      button.type = "button";
      button.style.marginLeft = "20px";
      button.addEventListener("click", () => {
        const url = URL.createObjectURL(
          new Blob([calendarFile(s)], { type: "text/calendar;charset=utf-8" }),
        );
        const download = node("a");
        download.href = url;
        download.download = `csd-${s.id}.ics`;
        document.body.append(download);
        download.click();
        download.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      content.append(button);
    }
    feature.append(date, content);
  }
  (next || upcomingList).replaceChildren(feature);
}
function renderRow(s) {
  const article = node("article", "seminar-row");
  article.id = s.id;
  const meta = node("div", "seminar-meta"),
    date = node("time", "", dateLabel(s, lang));
  date.dateTime = s.date;
  meta.append(
    date,
    node(
      "div",
      "time-room",
      [timeLabel(s, lang), roomLabel(s)].filter(Boolean).join(" · "),
    ),
  );
  if (s.status === "tentative") meta.append(node("span", "pill", t.tentative));
  if (s.status === "cancelled") meta.append(node("span", "pill", t.cancelled));
  if (s.type && t.eventTypes[s.type])
    meta.append(node("span", "small-label", t.eventTypes[s.type]));
  const coming = upcomingSeminars([s]).length > 0;
  const content = node("div");
  content.append(
    node(
      "h3",
      "",
      s.titleKnown === false
        ? coming
          ? t.titlePending
          : t.unknownTitle
        : s.title,
    ),
  );
  const speaker = node("p"),
    name = node("span", "speaker", s.speaker || t.unknownSpeaker);
  speaker.append(name);
  if (s.institution)
    speaker.append(document.createTextNode(` · ${s.institution}`));
  content.append(speaker);
  for (const [key, label] of [
    ["abstract", t.abstract],
    ["sourceNote", t.sourceNote],
  ])
    if (s[key]) {
      const details = node("details");
      details.append(node("summary", "", label), node("p", "", s[key]));
      content.append(details);
    }
  if (s.talks?.length > 1) {
    const details = node("details");
    details.append(node("summary", "", t.sessionTalks));
    for (const talk of s.talks) {
      const p = node("p");
      p.append(
        node("strong", "", talk.speaker),
        document.createTextNode(` · ${talk.title}`),
      );
      details.append(p);
    }
    content.append(details);
  }
  if (safeURL(s.url)) {
    const a = node("a", "text-link", `${t.original} ↗`);
    a.href = safeURL(s.url);
    content.append(a);
  }
  article.append(meta, content);
  return article;
}
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
function renderArchive() {
  if (!list) return;
  const query = normalize(document.getElementById("search").value.trim()),
    year = document.getElementById("year").value;
  const upcoming = new Set(upcomingSeminars(programme).map((s) => s.id));
  const matches = sortSeminars(programme).filter(
    (s) =>
      !upcoming.has(s.id) &&
      (!year || s.date.startsWith(year)) &&
      (!query ||
        normalize([s.speaker, s.title, s.institution].join(" ")).includes(
          query,
        )),
  );
  list.replaceChildren(...matches.slice(0, limit).map(renderRow));
  if (!matches.length) list.append(node("p", "notice", t.searchEmpty));
  document.getElementById("results-count").textContent =
    `${matches.length} ${matches.length === 1 ? t.result : t.results}`;
  const more = document.getElementById("show-more");
  more.hidden = matches.length <= limit;
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    const item = programme.find((s) => s.id === hash);
    if (item && !upcoming.has(item.id) && !document.getElementById(hash)) {
      list.append(renderRow(item));
    }
    document
      .getElementById(hash)
      ?.scrollIntoView({ behavior: "instant", block: "center" });
  }
}
function accept(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.seminars) ||
    data.seminars.some(
      (s) =>
        !s.id ||
        typeof s.date !== "string" ||
        !Number.isFinite(Date.parse(s.date)),
    )
  )
    throw new Error("Invalid seminar data");
  programme = data.seminars;
  renderNext();
  if (list) {
    const year = document.getElementById("year"),
      selected = year.value;
    year.replaceChildren(
      new Option(t.allYears, ""),
      ...[...new Set(programme.map((s) => s.date.slice(0, 4)))]
        .sort()
        .reverse()
        .map((y) => new Option(y, y)),
    );
    year.value = selected;
    renderArchive();
  }
}
async function load() {
  try {
    let data;
    const api = window.CSD_CONFIG?.apiBase;
    if (api) {
      try {
        const res = await fetch(`${api.replace(/\/$/, "")}/seminars`, {
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error("Unavailable");
        data = await res.json();
      } catch {
        const notice = document.getElementById("programme-notice");
        if (notice) notice.replaceChildren(node("p", "notice", t.failed));
      }
    }
    if (!data) {
      const response = await fetch("/data/seminars.json", {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error("Unavailable");
      data = await response.json();
    }
    accept(data);
  } catch {
    const notice = document.getElementById("programme-notice");
    if (notice) notice.replaceChildren(node("p", "notice", t.failed));
  }
}
if (next || list) {
  document
    .getElementById("archive-search")
    ?.addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("search")?.addEventListener("input", () => {
    limit = 30;
    renderArchive();
  });
  document.getElementById("year")?.addEventListener("change", () => {
    limit = 30;
    renderArchive();
  });
  document.getElementById("show-more")?.addEventListener("click", () => {
    limit += 30;
    renderArchive();
  });
  load();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") load();
  });
}
