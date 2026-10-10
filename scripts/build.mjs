import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pages, route, renderPage } from "../site/render.mjs";
import { parseDateTime } from "../worker/src/index.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  dist = path.join(root, "dist");
const content = JSON.parse(
  await readFile(path.join(root, "data/content.json"), "utf8"),
);
const db = JSON.parse(
  await readFile(path.join(root, "data/seminars.json"), "utf8"),
);
const memberNames = new Set();
for (const person of content.teams) {
  if (
    typeof person.name !== "string" ||
    memberNames.has(person.name) ||
    !/^https?:\/\//.test(person.url) ||
    !/^\/assets\/images\/people\/[a-z0-9-]+\.(?:webp|jpe?g|png)$/.test(
      person.portrait?.src,
    ) ||
    !person.research?.en ||
    !person.research?.fr ||
    (person.portrait.position &&
      !/^\d{1,3}% \d{1,3}%$/.test(person.portrait.position))
  )
    throw new Error(`Invalid member profile: ${person.name}`);
  await readFile(path.join(root, person.portrait.src));
  memberNames.add(person.name);
}
if (
  db.version !== 1 ||
  db.timezone !== "Europe/Paris" ||
  !Array.isArray(db.seminars)
)
  throw new Error("Unsupported seminar database");
const ids = new Set();
for (const s of db.seminars) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(s.id) ||
    ids.has(s.id) ||
    !Number.isFinite(Date.parse(s.date)) ||
    typeof s.speaker !== "string" ||
    typeof s.title !== "string"
  )
    throw new Error(`Invalid seminar record ${s.id}`);
  if (s.date.length === 10) {
    if (new Date(s.date).toISOString().slice(0, 10) !== s.date)
      throw new Error(`Invalid calendar date ${s.id}`);
  } else parseDateTime(s.date);
  ids.add(s.id);
}
let apiBase = (process.env.CSD_API_URL || "").replace(/\/$/, "");
if (apiBase) {
  const parsed = new URL(apiBase);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname)
    )
  )
    throw new Error("CSD_API_URL must use HTTPS");
  if (parsed.search || parsed.hash || parsed.username || parsed.password)
    throw new Error("Invalid API URL");
}
const origin = (process.env.CSD_SITE_URL || "https://csdulm.github.io").replace(
  /\/$/,
  "",
);
if (new URL(origin).origin !== origin || !origin.startsWith("https://"))
  throw new Error("CSD_SITE_URL must be an HTTPS origin without a path");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, "assets"), path.join(dist, "assets"), {
  recursive: true,
});
await cp(path.join(root, "data"), path.join(dist, "data"), { recursive: true });
await cp(
  path.join(root, "site/strings.mjs"),
  path.join(dist, "assets/js/strings.mjs"),
);
await writeFile(
  path.join(dist, "assets/js/config.js"),
  `window.CSD_CONFIG = Object.freeze(${JSON.stringify({ apiBase })});\n`,
);
for (const lang of ["en", "fr"])
  for (const page of pages) {
    const dir = path.join(dist, route(page, lang));
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "index.html"),
      renderPage(page, lang, content, db.seminars, origin),
    );
  }
await cp(path.join(root, "admin"), path.join(dist, "admin"), {
  recursive: true,
});
await writeFile(
  path.join(dist, "404.html"),
  renderPage("404", "en", content, db.seminars, origin),
);
await writeFile(path.join(dist, ".nojekyll"), "");
await writeFile(
  path.join(dist, "robots.txt"),
  `User-agent: *\nDisallow: /admin/\nSitemap: ${origin}/sitemap.xml\n`,
);
const urls = ["en", "fr"].flatMap((lang) =>
  pages.map((page) => `<url><loc>${origin}${route(page, lang)}</loc></url>`),
);
await writeFile(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`,
);
// Verify every local page, script, style and image reference before publishing.
const htmlFiles = [
  ...["en", "fr"].flatMap((lang) =>
    pages.map((page) => path.join(dist, route(page, lang), "index.html")),
  ),
  path.join(dist, "admin/index.html"),
  path.join(dist, "404.html"),
];
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const url = new URL(
      match[1],
      "https://local.test" +
        path.relative(dist, file).split(path.sep).join("/").replace(/^/, "/"),
    );
    if (url.origin !== "https://local.test") continue;
    let target = path.join(dist, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) target = path.join(target, "index.html");
    try {
      await readFile(target);
    } catch {
      throw new Error(
        `Broken local reference ${match[1]} in ${path.relative(dist, file)}`,
      );
    }
  }
}
console.log(
  `Built 10 translated public pages, seminar administration and ${db.seminars.length} seminar records in dist/.`,
);
console.log(
  apiBase
    ? `Private API configured: ${apiBase}`
    : "Private API not configured: management forms remain disabled until deployment.",
);
