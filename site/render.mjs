import { strings } from "./strings.mjs";
import {
  escapeHTML as e,
  safeURL,
  dateLabel,
  timeLabel,
  titleLabel,
  upcomingSeminars,
  sortSeminars,
} from "../assets/js/seminars.mjs";
export const pages = ["home", "about", "teams", "seminars", "visit"];
export const route = (page, lang = "en") =>
  `${lang === "fr" ? "/fr" : ""}${page === "home" ? "/" : `/${page}/`}`;
const arrow = '<span aria-hidden="true">↗</span>';
const right = '<span aria-hidden="true">→</span>';
const roomLabel = (s, t) =>
  s.room
    ? s.roomKnown === false
      ? `${s.room} (${t.defaultRoom})`
      : s.room
    : "";
const ext = (url, text, cls = "", label = "") =>
  `<a href="${e(safeURL(url))}"${cls ? ` class="${cls}"` : ""}${label ? ` aria-label="${e(label)}"` : ""}>${e(text)} ${arrow}</a>`;
const speakerHeading = (s, t) =>
  `<h3>${e(s.speaker || t.unknownSpeaker)}${s.institution ? `<span class="seminar-institution"> · ${e(s.institution)}</span>` : ""}</h3>`;
export function seminarRow(s, lang = "en", now = Date.now()) {
  const t = strings[lang],
    upcoming = upcomingSeminars([s], now).length > 0;
  const clock = timeLabel(s, lang),
    room = roomLabel(s, t);
  return `<article class="seminar-row" id="${e(s.id)}"><div class="seminar-meta"><time datetime="${e(s.date)}">${e(dateLabel(s, lang))}</time><div class="time-room">${e([clock, room].filter(Boolean).join(" · "))}</div>${upcoming ? `<span class="pill green">${e(t.upcomingLabel)}</span>` : ""}${s.status === "tentative" ? `<span class="pill">${e(t.tentative)}</span>` : ""}${s.status === "cancelled" ? `<span class="pill">${e(t.cancelled)}</span>` : ""}${s.type && t.eventTypes[s.type] ? `<span class="small-label">${e(t.eventTypes[s.type])}</span>` : ""}</div><div>${speakerHeading(s, t)}<p class="seminar-title">${e(titleLabel(s))}</p>${s.talks?.length > 1 ? `<details><summary>${e(t.sessionTalks)}</summary>${s.talks.map((talk) => `<p><strong>${e(talk.speaker)}</strong> · ${e(titleLabel(talk))}</p>`).join("")}</details>` : ""}${s.abstract ? `<details><summary>${e(t.abstract)}</summary><p>${e(s.abstract)}</p></details>` : ""}${s.sourceNote ? `<details><summary>${e(t.sourceNote)}</summary><p>${e(s.sourceNote)}</p></details>` : ""}</div></article>`;
}
export function nextFeature(seminars, lang = "en") {
  const t = strings[lang],
    s = upcomingSeminars(seminars)[0];
  if (!s)
    return `<div class="seminar-feature empty"><div class="empty-seminar"><div><h3>${e(t.noneTitle)}</h3><p>${e(t.noneBody)}</p></div><a class="text-link" href="${route("seminars", lang)}">${e(t.archiveLink)} ${right}</a></div></div>`;
  return `<div class="seminar-feature"><div class="seminar-date">${e(dateLabel(s, lang, { year: undefined }))}<span>${e([timeLabel(s, lang), roomLabel(s, t)].filter(Boolean).join(" · "))}</span></div><div><div class="eyebrow">${e(t.nextLabel)}${s.status === "tentative" ? ` · ${e(t.tentative)}` : ""}</div>${speakerHeading(s, t)}<p class="seminar-title">${e(titleLabel(s))}</p><div class="seminar-actions"><a class="text-link" href="${route("seminars", lang)}#${e(s.id)}">${e(t.seminarLink)} ${right}</a></div></div></div>`;
}
function masthead(page, lang) {
  const t = strings[lang];
  return `<header class="site-header"><div class="container"><div class="header-inner"><a class="brand" href="${route("home", lang)}" aria-label="${e(t.brand)}"><span class="brand-mark">csd<span style="color:var(--accent)">.</span></span><span class="brand-text"><strong>SCIENCES DES DONNÉES</strong>École normale supérieure · PSL</span></a><button class="nav-toggle" aria-controls="main-nav" aria-expanded="false">${e(t.menu)}</button><nav class="nav" id="main-nav" aria-label="${lang === "fr" ? "Navigation principale" : "Main navigation"}">${pages
    .slice(1)
    .map(
      (p) =>
        `<a href="${route(p, lang)}"${page === p ? ' aria-current="page"' : ""}>${e(t.nav[p])}</a>`,
    )
    .join(
      "",
    )}<a class="language-link" lang="${lang === "en" ? "fr" : "en"}" hreflang="${lang === "en" ? "fr" : "en"}" href="${route(page === "404" ? "home" : page, lang === "en" ? "fr" : "en")}" aria-label="${lang === "en" ? "Lire en français" : "Read in English"}">${t.language}</a></nav></div></div></header>`;
}
function imageCredit(photo, lang) {
  return `<a href="${e(photo.sourceUrl)}">${e(photo.caption[lang])} — ${e(photo.author)}</a> · <a href="${e(photo.licenseUrl)}">${e(photo.license)}</a> · ${e(strings[lang].photoChanges)}`;
}
function footer(lang, content, photo) {
  const t = strings[lang];
  return `<footer class="site-footer"><div class="container"><div class="footer-main"><div><div class="footer-title">Centre Sciences des Données</div><div class="footer-address">${e(t.footerENS)}<br>${e(t.footerAddress)}</div></div><div class="footer-links"><a href="${route("visit", lang)}">${e(t.nav.visit)}</a><a href="${e(content.mailingList.url)}">${e(t.mailButton)}</a><a href="/admin/${lang === "fr" ? "?lang=fr" : ""}">${e(t.footerAdmin)}</a><a href="https://github.com/CSDUlm/csdulm.github.io">${e(t.footerSource)}</a></div></div><div class="footer-bottom"><p>© ${new Date().getUTCFullYear()} Centre Sciences des Données · ENS–PSL</p><p>${imageCredit(photo, lang)}</p></div></div></footer>`;
}
function mailing(lang, content) {
  const t = strings[lang];
  return `<section class="section section-dark"><div class="container mail-section"><div><h2>${e(t.mailTitle)}</h2><p>${e(t.mailBody)}</p></div>${ext(content.mailingList.url, t.mailButton, "button")}</div></section>`;
}
function pageTop(eyebrow, title, lead, photo = null, lang = "en") {
  return `<section class="page-top${photo ? " image" : ""}">${photo ? `<img class="page-image" src="${e(photo.src)}" alt="" width="${photo.width}" height="${photo.height}" decoding="async" style="object-position:${e(photo.position)}">` : ""}<div class="container"><p class="eyebrow">${e(eyebrow)}</p><h1>${title}</h1><p class="lead">${e(lead)}</p></div>${photo ? `<span class="page-image-caption">${e(photo.caption[lang])}</span>` : ""}</section>`;
}
function home(lang, c, seminars) {
  const t = strings[lang],
    photo = c.images.home;
  return `<section class="hero"><img class="hero-image" src="${e(photo.src)}" alt="" fetchpriority="high" width="${photo.width}" height="${photo.height}"><div class="container hero-content"><p class="eyebrow">${e(t.heroEyebrow)}</p><h1>${t.heroTitle}</h1><p class="lead">${e(t.heroLead)}</p><div class="hero-bottom"><a class="button" href="${route("about", lang)}">${e(t.discover)} ${right}</a><a class="text-link" href="${route("seminars", lang)}">${e(t.seminarLink)} ${right}</a></div></div><span class="hero-caption">${e(photo.caption[lang])}</span></section><div class="intro-strip"><div class="container intro-strip-inner"><span>${e(t.disciplinesLabel)}</span><div class="disciplines">${t.disciplines.map((d) => `<div>${e(d)}</div>`).join("")}</div></div></div><section class="section"><div class="container"><div class="section-head"><div><p class="eyebrow">${e(t.nextEyebrow)}</p><h2>${e(t.nextTitle)}</h2></div><p>${e(t.nextDescription)}</p></div><div id="next-seminar">${nextFeature(seminars, lang)}</div></div></section><section class="section" style="border-top:1px solid var(--line)"><div class="container split"><div><p class="eyebrow">${e(t.homeAboutEyebrow)}</p><h2>${t.homeAboutTitle}</h2><div class="number-links">${["about", "teams", "visit"].map((p, i) => `<a class="number-link" href="${route(p, lang)}"><div><span>0${i + 1}</span>${e(t[`${p}Link`])}</div>${right}</a>`).join("")}</div></div><div class="prose"><p class="large-text">${e(t.homeAboutLead)}</p><p>${e(t.homeAboutBody)}</p><img src="${e(photo.src)}" alt="${e(photo.caption[lang])}" loading="lazy" width="${photo.width}" height="${photo.height}" style="width:100%;height:220px;object-fit:cover;opacity:.5;filter:grayscale(.7);margin-top:15px"></div></div></section><section class="section section-dark"><div class="container split"><div><p class="eyebrow">${e(t.communityEyebrow)}</p><h2>${t.communityTitle}</h2></div><div><p>${e(t.communityBody)}</p><a class="text-link" href="${route("teams", lang)}">${e(t.communityLink)} ${right}</a></div></div></section>`;
}
function about(lang, c) {
  const t = strings[lang];
  return `${pageTop(t.aboutEyebrow, t.aboutTitle, t.aboutLead, c.images.about, lang)}<section class="section"><div class="container content-grid"><aside class="side-note"><p class="small-label">${e(t.missionLabel)}</p><a href="#mission">${e(t.missionHeading)}</a><a href="#activities">${e(t.activitiesHeading)}</a><a href="#support">${e(t.supportHeading)}</a></aside><div class="prose"><h2 id="mission">${e(t.missionHeading)}</h2>${c.mission[lang].map((p, i) => `<p${i === 0 ? ' class="large-text"' : ""}>${e(p)}</p>`).join("")}<h2 id="activities">${e(t.activitiesHeading)}</h2><p>${e(t.activitiesBody)}</p><p>${e(t.activitiesBody2)}</p><a class="text-link" href="${route("seminars", lang)}">${e(t.seminarLink)} ${right}</a><h2>${e(t.trainingHeading)}</h2><p>${e(t.trainingBody)}</p><div class="supporters">${ext(c.phdSeminar.legacyUrl, t.phdLink)}${ext("https://csd.ens.psl.eu/?csd-courses", t.coursesLink)}</div><h2 id="support">${e(t.supportHeading)}</h2><div class="supporters">${c.supporters.map((s) => ext(s.url, s.name)).join("")}</div></div></div></section>${mailing(lang, c)}`;
}
function portraitCredit(p, lang) {
  const t = strings[lang],
    portrait = p.portrait;
  if (!safeURL(portrait.sourceUrl)) return "";
  return `<div class="portrait-credit">${portrait.credit ? `<span>${e(portrait.credit)}</span>` : ""}<a aria-label="${e(`${t.portraitSource} · ${p.name}`)}" href="${e(safeURL(portrait.sourceUrl))}">${e(t.portraitSource)} ${arrow}</a>${safeURL(portrait.licenseUrl) ? ` · <a href="${e(safeURL(portrait.licenseUrl))}">${e(portrait.license)}</a>` : ""}</div>`;
}
function personCard(p, lang) {
  const t = strings[lang];
  const portrait = p.portrait;
  return `<article class="person-card"><a class="person-portrait" href="${e(safeURL(p.url))}" aria-label="${e(`${p.name} · ${t.profileLabel}`)}"><img src="${e(portrait.src)}" alt="${e(p.name)}" loading="lazy" decoding="async" width="480" height="600"${portrait.position ? ` style="object-position:${e(portrait.position)}"` : ""}></a><div class="person-info"><h3><a href="${e(safeURL(p.url))}">${e(p.name)}</a></h3>${p.research?.[lang] ? `<p class="person-research">${e(p.research[lang])}</p>` : ""}<div class="person-links">${ext(p.url, t.profileLabel, "", `${t.profileLabel} · ${p.name}`)}</div>${portraitCredit(p, lang)}</div></article>`;
}
function teams(lang, c) {
  const t = strings[lang];
  return `${pageTop(t.teamsEyebrow, t.teamsTitle, t.teamsLead, c.images.teams, lang)}<section class="section"><div class="container"><div class="members-heading"><h2 id="principal-investigators">${e(t.teamsHeading)}</h2><p>${c.teams.length} ${e(t.galleryCount)}</p></div><div class="people-gallery">${c.teams.map((p) => personCard(p, lang)).join("")}</div></div></section><section class="section section-lined"><div class="container content-grid"><aside class="side-note"><a href="#steering">${e(t.steeringHeading)}</a><a href="#visitors">${e(t.visitorsHeading)}</a></aside><div class="prose"><h2 id="steering">${e(t.steeringHeading)}</h2><p>${e(t.steeringBody)}</p><ul class="people-inline">${c.steeringCommittee.map((p) => `<li>${safeURL(p.url) ? `<a href="${e(safeURL(p.url))}">${e(p.name)}</a>` : e(p.name)}</li>`).join("")}</ul><h2 id="visitors">${e(t.visitorsHeading)}</h2><p>${e(t.visitorsBody)}</p><ul class="people-inline">${c.invitedProfessors.map((p) => `<li>${e(p.name)} (${e(p.institution)}, ${e(p.year)})</li>`).join("")}</ul></div></div></section>${mailing(lang, c)}`;
}
function seminarsPage(lang, c, seminars) {
  const t = strings[lang];
  return `${pageTop(t.seminarEyebrow, t.seminarTitle, t.seminarLead, c.images.seminars, lang)}<section class="section" style="padding-bottom:0"><div class="container"><p class="notice">${e(c.seminar.usualSchedule[lang])}</p><div id="programme-notice" role="status"></div><div id="upcoming-section" style="padding-top:40px"><div class="section-head"><h2>${e(t.upcomingHeading)}</h2></div><div id="upcoming-list">${
    upcomingSeminars(seminars).length
      ? `<div class="seminar-list">${upcomingSeminars(seminars)
          .map((s) => seminarRow(s, lang))
          .join("")}</div>`
      : nextFeature([], lang)
  }</div></div></div></section><section class="section"><div class="container"><div class="section-head"><div><p class="eyebrow">CSD · ENS–PSL</p><h2>${e(t.pastHeading)}</h2></div><a class="text-link" href="/admin/${lang === "fr" ? "?lang=fr" : ""}">${e(t.organiserLink)} ${right}</a></div><form class="archive-toolbar" role="search" id="archive-search" hidden><div class="field"><label for="search">${e(t.searchLabel)}</label><input id="search" type="search" placeholder="${e(t.searchPlaceholder)}" autocomplete="off"></div><div class="field"><label for="year">${e(t.yearLabel)}</label><select id="year"><option value="">${e(t.allYears)}</option>${[
    ...new Set(seminars.map((s) => s.date.slice(0, 4))),
  ]
    .sort()
    .reverse()
    .map((y) => `<option>${e(y)}</option>`)
    .join(
      "",
    )}</select></div></form><p class="results-count" id="results-count" aria-live="polite">${seminars.filter((s) => !upcomingSeminars([s]).length).length} ${e(t.results)}</p><div class="seminar-list" id="seminar-list">${sortSeminars(
    seminars,
  )
    .filter((s) => !upcomingSeminars([s]).length)
    .map((s) => seminarRow(s, lang))
    .join(
      "",
    )}</div><button class="button secondary" id="show-more" hidden style="margin-top:25px">${e(t.more)} ${right}</button><div class="archive-end"><p>${e(t.recordNote)}</p><a href="/data/seminars.json" download>${e(t.download)}</a></div></div></section>${mailing(lang, c)}`;
}
function visit(lang, c) {
  const t = strings[lang],
    photo = c.images.visit;
  return `${pageTop(t.visitEyebrow, t.visitTitle, t.visitLead, photo, lang)}<section class="section"><div class="container visit-grid"><div><h2>${e(t.addressHeading)}</h2><p class="large-text">${e(t.addressLine)}<br>${e(t.addressStreet)}<br>${e(t.addressCity)}</p><p>${e(t.accessBody)}</p>${ext("https://www.openstreetmap.org/search?query=45%20rue%20d%27Ulm%2075005%20Paris", t.mapLink, "text-link")}<div class="contact-box"><h3>${e(t.contactHeading)}</h3><p>${e(t.contactBody)}</p>${ext(c.mailingList.url, t.mailButton, "button")}</div></div><figure style="margin:0"><img class="visit-photo" src="${e(photo.src)}" alt="${e(photo.caption[lang])}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async" style="object-position:${e(photo.position)}"><figcaption class="photo-credit">${imageCredit(photo, lang)}</figcaption></figure></div></section>`;
}
export function renderPage(
  page,
  lang,
  c,
  seminars,
  origin = "https://csdulm.github.io",
  assetVersion = "",
) {
  const t = strings[lang],
    photo = c.images[page] || c.images.home;
  const asset = (url) =>
    `${url}${assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : ""}`;
  const titles = {
    home: "Centre Sciences des Données · ENS–PSL",
    about: `${t.nav.about} · CSD ENS`,
    teams: `${t.nav.teams} · CSD ENS`,
    seminars: `${t.nav.seminars} · CSD ENS`,
    visit: `${t.nav.visit} · CSD ENS`,
    404: "Page not found · CSD ENS",
  };
  const description = {
    home: t.heroLead,
    about: t.aboutLead,
    teams: t.teamsLead,
    seminars: t.seminarLead,
    visit: t.visitLead,
    404: t.notFoundLead,
  }[page];
  const body =
    { home, about, teams, seminars: seminarsPage, visit }[page]?.(
      lang,
      c,
      seminars,
    ) ??
    `${pageTop("CSD · ENS–PSL", e(t.notFound), t.notFoundLead)}<section class="section"><div class="container"><a class="button" href="/">${e(t.nav.home)} ${right}</a></div></section>`;
  return `<!doctype html><html lang="${lang}" data-page="${page}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(description)}"><meta name="theme-color" content="#174c45"><title>${e(titles[page])}</title>${page === "404" ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${origin}${route(page, lang)}"><link rel="alternate" hreflang="en" href="${origin}${route(page, "en")}"><link rel="alternate" hreflang="fr" href="${origin}${route(page, "fr")}"><link rel="alternate" hreflang="x-default" href="${origin}${route(page, "en")}">`}<meta property="og:type" content="website"><meta property="og:title" content="${e(titles[page])}"><meta property="og:description" content="${e(description)}"><meta property="og:image" content="${origin}${e(photo.shareSrc || photo.src)}"><meta property="og:image:alt" content="${e(photo.caption[lang])}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${e(asset("/assets/css/site.css"))}"><noscript><link rel="stylesheet" href="${e(asset("/assets/css/noscript.css"))}"></noscript><script src="${e(asset("/assets/js/config.js"))}" defer></script><script type="module" src="${e(asset("/assets/js/site.js"))}"></script></head><body><a class="skip-link" href="#main">${e(t.skip)}</a>${masthead(page, lang)}<main id="main">${body}</main>${footer(lang, c, photo)}</body></html>`;
}
