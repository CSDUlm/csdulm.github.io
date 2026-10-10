import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../assets/js/manage.js", import.meta.url),
  "utf8",
);
function dateHelpers(lang = "") {
  const context = {
    window: { location: { search: lang } },
    document: { body: { dataset: { management: "test" } } },
    URLSearchParams,
    Intl,
    Date,
    Set,
    Object,
    Number,
    Error,
  };
  vm.runInNewContext(source, context);
  return context.window.CSD_TIME;
}
const time = dateHelpers();

test("The login form cannot leak a password into a URL before JavaScript initializes", () => {
  const html = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const form = html.match(/<form\b[^>]*\bid="login-form"[^>]*>/s)?.[0];
  const password = html.match(/<input\b[^>]*\bid="password"[^>]*>/s)?.[0];
  const button = html.match(/<button\b[^>]*\bid="login-button"[^>]*>/s)?.[0];
  assert.ok(form && password && button, "Login controls exist in the static page");
  assert.match(form, /\bmethod="post"/i, "Native form submission must not use GET");
  assert.match(password, /\bdisabled(?:\s|>|=)/, "Password entry is disabled until the handler is ready");
  assert.match(button, /\bdisabled(?:\s|>|=)/, "Native submission is disabled until the handler is ready");
});

test("Unconfigured administration keeps login disabled and sends no password", async () => {
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      disabled: true, value: "", events: {}, dataset: {},
      addEventListener(name, callback) { this.events[name] = callback; },
    });
    return elements.get(id);
  };
  let requests = 0;
  vm.runInNewContext(source, {
    window: { location: { search: "" }, CSD_CONFIG: { apiBase: "" }, addEventListener() {} },
    document: { body: { dataset: { management: "seminars" } }, documentElement: {}, getElementById, querySelectorAll: () => [] },
    fetch: async () => { requests += 1; throw new Error("Unexpected request"); },
    URLSearchParams, Intl, Date, Set, Object, Number, Error,
  });
  assert.equal(getElementById("password").disabled, true);
  assert.equal(getElementById("login-button").disabled, true);
  await getElementById("login-form").events.submit({ preventDefault() {} });
  assert.equal(requests, 0);
});

test("Paris datetime inputs become the correct winter and summer instants", () => {
  assert.equal(
    time.toParisInstant("2026-01-20T14:00"),
    "2026-01-20T13:00:00.000Z",
  );
  assert.equal(
    time.toParisInstant("2026-07-20T14:00"),
    "2026-07-20T12:00:00.000Z",
  );
  assert.equal(
    time.toParisInstant("2026-03-29T01:30"),
    "2026-03-29T00:30:00.000Z",
  );
  assert.equal(
    time.toParisInstant("2026-03-29T03:30"),
    "2026-03-29T01:30:00.000Z",
  );
  assert.equal(
    time.toParisInstant("2026-10-25T01:30"),
    "2026-10-24T23:30:00.000Z",
  );
  assert.equal(
    time.toParisInstant("2026-10-25T03:30"),
    "2026-10-25T02:30:00.000Z",
  );
});

test("DST gaps and repeated hours are rejected instead of silently changing the seminar time", () => {
  assert.throws(
    () => time.toParisInstant("2026-03-29T02:30"),
    /does not exist/,
  );
  assert.throws(() => time.toParisInstant("2026-10-25T02:30"), /occurs twice/);
  const french = dateHelpers("?lang=fr");
  assert.throws(
    () => french.toParisInstant("2026-03-29T02:30"),
    /n’existe pas/,
  );
  assert.throws(() => french.toParisInstant("2026-10-25T02:30"), /deux fois/);
});

test("Invalid dates are rejected and valid leap days are preserved", () => {
  for (const input of [
    "2026-02-30T12:00",
    "2026-02-29T12:00",
    "2026-13-01T12:00",
    "2026-01-01T24:00",
    "2026-01-01T12:60",
    "not a date",
  ]) {
    assert.throws(() => time.toParisInstant(input), /valid date/);
  }
  assert.equal(
    time.toParisInstant("2028-02-29T12:00"),
    "2028-02-29T11:00:00.000Z",
  );
});

test("Seminar dates follow Paris local time across midnight", () => {
  assert.equal(time.dateKey("2026-01-20T23:30:00Z"), "2026-01-21");
  assert.equal(time.dateKey("2026-07-20T22:30:00Z"), "2026-07-21");
  assert.equal(time.dateKey("2026-12-31T23:30:00Z"), "2027-01-01");
});

test("Administration preserves unknown seminar details and displays upcoming event status", async () => {
  class Element {
    constructor() {
      this.children = [];
      this.events = {};
      this.dataset = {};
      this.value = "";
    }
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = children;
    }
    addEventListener(name, callback) {
      this.events[name] = callback;
    }
    focus() {}
    reset() {}
  }
  const ids = [
    "login-panel",
    "authenticated-panel",
    "login-form",
    "status-message",
    "password",
    "session-message",
    "login-button",
    "logout-button",
    "seminar-list",
    "seminar-form",
    "seminar-submit",
    "refresh-seminars",
    "speaker",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  elements.password.disabled = true;
  elements["login-button"].disabled = true;
  elements.password.value = "test-password";
  const window = {
    location: {
      search: "",
      href: "https://csd.example/admin/",
      origin: "https://csd.example",
    },
    CSD_CONFIG: { apiBase: "https://api.example" },
    addEventListener() {},
  };
  const document = {
    body: { dataset: { management: "seminars" } },
    documentElement: {},
    getElementById: (id) => elements[id],
    querySelectorAll: () => [],
    createElement: () => new Element(),
  };
  const fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith("/auth/login")
        ? {
            token: "test-token",
            role: "seminars",
            expiresAt: new Date(Date.now() + 1800000).toISOString(),
          }
        : {
            seminars: [
              {
                id: "historical",
                speaker: "Historical speaker",
                institution: "",
                title: "Generic imported title",
                date: "2000-04-02",
                room: null,
                titleKnown: false,
                timeKnown: false,
                roomKnown: false,
              },
              {
                id: "future",
                speaker: "Upcoming speaker",
                institution: "",
                title: "Generic imported title",
                date: time.dateKey(Date.now() + 7 * 86400000),
                room: null,
                titleKnown: false,
                timeKnown: false,
                roomKnown: false,
                status: "tentative",
              },
              {
                id: "cancelled",
                speaker: "Cancelled speaker",
                institution: "",
                title: "Generic imported title",
                date: time.dateKey(Date.now() + 14 * 86400000),
                room: null,
                titleKnown: false,
                timeKnown: false,
                roomKnown: false,
                status: "cancelled",
              },
            ],
          },
  });
  vm.runInNewContext(source, {
    window,
    document,
    fetch,
    URLSearchParams,
    URL,
    Intl,
    Date,
    Set,
    Object,
    Number,
    Error,
    AbortController,
    setTimeout: () => 1,
    clearTimeout() {},
  });
  assert.equal(elements.password.disabled, false, "Configured login enables password entry after installing the handler");
  assert.equal(elements["login-button"].disabled, false, "Configured login enables submission after installing the handler");
  await elements["login-form"].events.submit({ preventDefault() {} });
  const allText = (element) => [
    element.textContent || "",
    ...element.children.flatMap(allText),
  ];
  const rendered = allText(elements["seminar-list"]).join(" ");
  assert.match(rendered, /Historical speaker -/);
  assert.match(rendered, /Upcoming speaker -/);
  assert.match(rendered, /Tentative/);
  assert.match(rendered, /Cancelled/);
  assert.match(rendered, /Time and room not recorded/);
  assert.doesNotMatch(
    rendered,
    /Room W|00:00|Generic imported title|Title not recorded|Title to be announced/,
  );
  assert.equal(elements.password.value, "");
});
