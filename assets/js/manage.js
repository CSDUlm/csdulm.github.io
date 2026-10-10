(() => {
  "use strict";

  const french =
    new URLSearchParams(window.location.search).get("lang") === "fr";
  const locale = french ? "fr-FR" : "en-GB";
  const zone = "Europe/Paris";
  const translations = {
    home: ["Home", "Accueil"],
    seminars: ["Seminars", "Séminaires"],
    adminEyebrow: [
      "For seminar organisers",
      "Pour les organisateurs du séminaire",
    ],
    adminTitle: ["Seminar administration", "Gestion des séminaires"],
    adminIntro: [
      "Add a speaker and the details of their upcoming seminar. Changes appear on the public seminar page and the homepage.",
      "Ajoutez un intervenant et les informations de son prochain séminaire. Les modifications apparaissent sur la page du séminaire et sur la page d’accueil.",
    ],
    signIn: ["Sign in", "Se connecter"],
    password: ["Password", "Mot de passe"],
    adminLoginHint: [
      "Use the seminar organiser password to make changes. No GitHub account is required.",
      "Utilisez le mot de passe des organisateurs pour modifier les séminaires. Aucun compte GitHub n’est nécessaire.",
    ],
    signOut: ["Sign out", "Se déconnecter"],
    newSeminar: ["Add a seminar", "Ajouter un séminaire"],
    parisTimes: [
      "All times are Paris local time.",
      "Tous les horaires sont à l’heure de Paris.",
    ],
    speaker: ["Speaker", "Intervenant"],
    institution: ["Institution", "Établissement"],
    talkTitle: ["Talk title", "Titre de l’exposé"],
    dateTime: ["Date and time", "Date et heure"],
    room: ["Room", "Salle"],
    abstract: ["Abstract (optional)", "Résumé (facultatif)"],
    publishSeminar: ["Publish seminar", "Publier le séminaire"],
    publishHint: [
      "Please check the details before publishing.",
      "Vérifiez les informations avant de publier.",
    ],
    seminarList: ["Seminars", "Séminaires"],
    refresh: ["Refresh", "Actualiser"],
    backToCsd: ["Back to CSD", "Retour au CSD"],
    roomsEyebrow: ["CSD · Internal space", "CSD · Espace interne"],
    roomsTitle: ["Room reservations", "Réservation des salles"],
    roomsIntro: [
      "View and manage reservations for the four CSD meeting and video conference rooms. Sign in to access the calendar.",
      "Consultez et gérez les réservations des quatre salles de réunion et de visioconférence du CSD. Connectez-vous pour accéder au calendrier.",
    ],
    roomsLoginHint: [
      "Use the room booking password to view, add, or remove reservations. No GitHub account is required.",
      "Utilisez le mot de passe de réservation des salles pour consulter, ajouter ou supprimer des réservations. Aucun compte GitHub n’est nécessaire.",
    ],
    roomCalendar: ["Room calendar", "Calendrier des salles"],
    viewRoom: ["View room", "Afficher une salle"],
    allRooms: ["All rooms", "Toutes les salles"],
    previous: ["Previous", "Précédent"],
    today: ["Today", "Aujourd’hui"],
    next: ["Next", "Suivant"],
    newReservation: ["Reserve a room", "Réserver une salle"],
    reservationLimit: [
      "Reservations can last up to 24 hours.",
      "Une réservation peut durer jusqu’à 24 heures.",
    ],
    reservedBy: ["Reserved by", "Réservé par"],
    start: ["Start", "Début"],
    end: ["End", "Fin"],
    saveReservation: ["Reserve room", "Réserver"],
    overlapHint: [
      "Overlapping bookings for the same room are prevented.",
      "Les réservations qui se chevauchent dans une même salle sont refusées.",
    ],
    unavailable: [
      "Online management is not configured yet. Please contact CSD to request access.",
      "La gestion en ligne n’est pas encore configurée. Contactez le CSD pour obtenir un accès.",
    ],
    connectionError: [
      "The service could not be reached. Please try again.",
      "Le service est inaccessible. Réessayez.",
    ],
    signingIn: ["Signing in…", "Connexion…"],
    sessionExpired: [
      "Your session has ended. Please sign in again.",
      "Votre session est terminée. Reconnectez-vous.",
    ],
    signedOut: ["You have signed out.", "Vous êtes déconnecté."],
    loading: ["Loading…", "Chargement…"],
    noSeminars: [
      "No seminars have been added yet.",
      "Aucun séminaire n’a encore été ajouté.",
    ],
    titleNotRecorded: ["Title not recorded", "Titre non renseigné"],
    titleToBeAnnounced: ["Title to be announced", "Titre à venir"],
    detailsNotRecorded: [
      "Time and room not recorded",
      "Horaire et salle non renseignés",
    ],
    statusTentative: ["Tentative", "Provisoire"],
    statusCancelled: ["Cancelled", "Annulé"],
    seminarPublished: ["Seminar published.", "Le séminaire a été publié."],
    seminarRemoved: ["Seminar removed.", "Le séminaire a été supprimé."],
    reservationSaved: [
      "Your room has been reserved.",
      "Votre salle a été réservée.",
    ],
    reservationRemoved: [
      "Reservation removed.",
      "La réservation a été supprimée.",
    ],
    saveFailed: [
      "The change could not be saved. Please try again.",
      "La modification n’a pas pu être enregistrée. Réessayez.",
    ],
    delete: ["Remove", "Supprimer"],
    confirmDelete: ["Confirm removal", "Confirmer"],
    cancel: ["Cancel", "Annuler"],
    deleteQuestion: ["Remove this entry?", "Supprimer cette entrée ?"],
    saving: ["Saving…", "Enregistrement…"],
    available: ["No reservations", "Aucune réservation"],
    calendarError: [
      "Reservations could not be loaded. Please refresh.",
      "Impossible de charger les réservations. Actualisez la page.",
    ],
    invalidDate: [
      "Enter a valid date and time.",
      "Saisissez une date et une heure valides.",
    ],
    missingTime: [
      "This Paris time does not exist because the clocks move forward. Please choose another time.",
      "Cette heure n’existe pas à Paris lors du passage à l’heure d’été. Choisissez une autre heure.",
    ],
    repeatedTime: [
      "This Paris time occurs twice when the clocks move back. Please choose a time outside the repeated hour (02:00–02:59).",
      "Cette heure survient deux fois lors du passage à l’heure d’hiver. Choisissez une heure en dehors de l’heure répétée (02:00–02:59).",
    ],
    invalidInterval: [
      "The end must be later than the start, and the reservation cannot exceed 24 hours.",
      "La fin doit être après le début et la réservation ne peut pas dépasser 24 heures.",
    ],
    overlap: [
      "This room is already reserved during that time. Choose a different room or time.",
      "Cette salle est déjà réservée à cet horaire. Choisissez une autre salle ou un autre horaire.",
    ],
    invalidResponse: [
      "The service returned an unexpected response. Please try again.",
      "Le service a renvoyé une réponse inattendue. Réessayez.",
    ],
    tooManyLogins: [
      "Too many sign-in attempts. Please wait a few minutes before trying again.",
      "Trop de tentatives de connexion. Patientez quelques minutes avant de réessayer.",
    ],
    wrongPassword: [
      "The password was not accepted.",
      "Le mot de passe n’a pas été accepté.",
    ],
    accessDenied: [
      "Access was denied. Please check the service configuration with CSD.",
      "L’accès a été refusé. Vérifiez la configuration du service avec le CSD.",
    ],
  };
  const t = (key) => translations[key]?.[french ? 1 : 0] || key;
  const rooms = {
    reunion: "Salle réunion",
    "reunion-bis": "Salle réunion bis",
    "visio-cafe": "Salle visio café",
    "visio-couloir": "Salle visio couloir",
  };
  const parisFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  function parisParts(instant) {
    return Object.fromEntries(
      parisFormatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
  }
  function dateKey(instant) {
    const p = parisParts(instant);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function addDays(day, count) {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function mondayFor(day) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    return addDays(day, -((weekday + 6) % 7));
  }
  function toParisInstant(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error(t("invalidDate"));
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    if (
      year < 1900 ||
      year > 2200 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour > 23 ||
      minute > 59
    )
      throw new Error(t("invalidDate"));
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const check = new Date(target);
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    )
      throw new Error(t("invalidDate"));
    const offsets = new Set();
    for (const delta of [-36, -12, 0, 12, 36]) {
      const sample = target + delta * 3600000;
      const p = parisParts(sample);
      offsets.add(
        Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) -
          sample,
      );
    }
    const candidates = [...offsets]
      .map((offset) => target - offset)
      .filter((candidate) => {
        const p = parisParts(candidate);
        return (
          +p.year === year &&
          +p.month === month &&
          +p.day === day &&
          +p.hour === hour &&
          +p.minute === minute
        );
      });
    if (candidates.length === 0) throw new Error(t("missingTime"));
    if (candidates.length > 1) throw new Error(t("repeatedTime"));
    return new Date(candidates[0]).toISOString();
  }
  // Pure date helpers are exposed for verification; authentication state stays private.
  window.CSD_TIME = Object.freeze({
    toParisInstant,
    dateKey,
    addDays,
    mondayFor,
  });

  const page = document.body.dataset.management;
  if (!["seminars", "rooms"].includes(page)) return;
  const role = page === "rooms" ? "bookings" : "seminars";
  const $ = (id) => document.getElementById(id);
  const loginPanel = $("login-panel");
  const authenticatedPanel = $("authenticated-panel");
  const loginForm = $("login-form");
  const status = $("status-message");
  const apiBase = String(window.CSD_CONFIG?.apiBase || "").replace(/\/+$/, "");
  let token = null;
  let sessionTimer = null;
  let sessionVersion = 0;
  let reservations = [];
  let calendarLoaded = false;
  let week = mondayFor(dateKey(Date.now()));
  let calendarRequest = 0;
  let seminarRequest = 0;

  document.documentElement.lang = french ? "fr" : "en";
  document.title =
    page === "rooms"
      ? french
        ? "Réservation des salles — CSD, ENS Ulm"
        : "Room reservations — CSD, ENS Ulm"
      : french
        ? "Gestion du séminaire — CSD, ENS Ulm"
        : "Seminar administration — CSD, ENS Ulm";
  for (const element of document.querySelectorAll("[data-i18n]"))
    element.textContent = t(element.dataset.i18n);
  for (const link of document.querySelectorAll("a[href]")) {
    if (link.hasAttribute("data-language-switch")) {
      link.href = french ? "?" : "?lang=fr";
      link.textContent = french ? "English" : "Français";
      link.lang = french ? "en" : "fr";
      link.setAttribute(
        "aria-label",
        french ? "Read this page in English" : "Lire cette page en français",
      );
    } else if (french) {
      const href = link.getAttribute("href");
      if (href === "../") link.href = "../fr/";
      else if (href === "../seminars/") link.href = "../fr/seminars/";
    }
  }
  function showStatus(message, tone = "success") {
    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = false;
  }
  function clearStatus() {
    status.hidden = true;
    status.textContent = "";
  }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function formatDate(instant, options) {
    return new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      ...options,
    }).format(new Date(instant));
  }
  function formatTime(instant) {
    return formatDate(instant, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = busy ? t("saving") : t(label);
  }
  function endSession(message, focus = true) {
    token = null;
    sessionVersion += 1;
    calendarRequest += 1;
    seminarRequest += 1;
    clearTimeout(sessionTimer);
    sessionTimer = null;
    reservations = [];
    calendarLoaded = false;
    authenticatedPanel.hidden = true;
    loginPanel.hidden = false;
    if ($("calendar")) $("calendar").replaceChildren();
    if ($("seminar-list")) $("seminar-list").replaceChildren();
    if ($("seminar-form")) $("seminar-form").reset();
    if ($("reservation-form")) $("reservation-form").reset();
    $("session-message").textContent = "";
    $("password").value = "";
    if (message) showStatus(message, "error");
    if (focus) $("password").focus();
  }
  async function request(
    path,
    { method = "GET", body, privateRequest = true } = {},
  ) {
    const requestToken = token;
    if (privateRequest && !requestToken) throw new Error(t("sessionExpired"));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (privateRequest) headers.Authorization = `Bearer ${requestToken}`;
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(t("connectionError"));
    } finally {
      clearTimeout(timeout);
    }
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error(t("invalidResponse"));
    }
    if (!response.ok) {
      if (response.status === 401 && privateRequest && token === requestToken)
        endSession(t("sessionExpired"));
      let message =
        typeof result.error === "string" ? result.error : t("saveFailed");
      if (response.status === 429) message = t("tooManyLogins");
      if (response.status === 401)
        message = t(privateRequest ? "sessionExpired" : "wrongPassword");
      if (response.status === 403) message = t("accessDenied");
      if (response.status === 409 && path.startsWith("/reservations"))
        message = t("overlap");
      if (response.status === 503) message = t("unavailable");
      throw new Error(message);
    }
    if (privateRequest && token !== requestToken)
      throw new Error(t("sessionExpired"));
    return result;
  }
  function addDeleteControl(parent, onDelete) {
    const container = make("div", "manage-delete");
    const remove = make(
      "button",
      "manage-button manage-button-quiet manage-button-delete",
      t("delete"),
    );
    remove.type = "button";
    container.append(remove);
    remove.addEventListener("click", () => {
      const question = make(
        "span",
        "manage-delete-question",
        t("deleteQuestion"),
      );
      const confirm = make(
        "button",
        "manage-button manage-button-quiet manage-button-delete",
        t("confirmDelete"),
      );
      const cancel = make(
        "button",
        "manage-button manage-button-quiet manage-button-delete",
        t("cancel"),
      );
      confirm.type = cancel.type = "button";
      container.replaceChildren(question, confirm, cancel);
      cancel.addEventListener("click", () => {
        container.replaceChildren(remove);
        remove.focus();
      });
      confirm.addEventListener("click", async () => {
        confirm.disabled = cancel.disabled = true;
        try {
          await onDelete();
        } catch (error) {
          showStatus(error.message, "error");
          confirm.disabled = cancel.disabled = false;
        }
      });
      confirm.focus();
    });
    parent.append(container);
  }
  async function loadSeminars() {
    const version = sessionVersion;
    const requestId = ++seminarRequest;
    const list = $("seminar-list");
    list.replaceChildren(make("p", "manage-loading", t("loading")));
    try {
      const result = await request("/seminars", { privateRequest: false });
      if (!token || version !== sessionVersion || requestId !== seminarRequest)
        return;
      if (!Array.isArray(result.seminars))
        throw new Error(t("invalidResponse"));
      list.replaceChildren();
      const entries = result.seminars
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!entries.length)
        list.append(make("p", "manage-empty", t("noSeminars")));
      for (const seminar of entries) {
        const article = make("article", "manage-seminar");
        const when = make("div");
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(seminar.date);
        const dateForFormatting = dateOnly
          ? `${seminar.date}T12:00:00Z`
          : seminar.date;
        const date = make(
          "time",
          "",
          formatDate(dateForFormatting, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        );
        date.dateTime = seminar.date;
        const details = [];
        if (!dateOnly && seminar.timeKnown !== false)
          details.push(formatTime(seminar.date));
        if (seminar.roomKnown !== false && seminar.room)
          details.push(seminar.room);
        when.append(
          date,
          make(
            "p",
            "",
            details.length ? details.join(" · ") : t("detailsNotRecorded"),
          ),
        );
        const detail = make("div");
        const upcoming = dateOnly
          ? seminar.date >= dateKey(Date.now())
          : Date.parse(seminar.date) >= Date.now();
        const title =
          seminar.titleKnown === false
            ? t(upcoming ? "titleToBeAnnounced" : "titleNotRecorded")
            : seminar.title;
        detail.append(
          make("h3", "", title),
          make(
            "p",
            "",
            [seminar.speaker, seminar.institution].filter(Boolean).join(" · "),
          ),
        );
        if (seminar.status === "tentative")
          detail.append(make("p", "manage-small", t("statusTentative")));
        if (seminar.status === "cancelled")
          detail.append(make("p", "manage-small", t("statusCancelled")));
        article.append(when, detail);
        addDeleteControl(article, async () => {
          await request(`/seminars/${encodeURIComponent(seminar.id)}`, {
            method: "DELETE",
          });
          showStatus(t("seminarRemoved"));
          await loadSeminars();
        });
        list.append(article);
      }
    } catch (error) {
      if (!token || version !== sessionVersion || requestId !== seminarRequest)
        return;
      list.replaceChildren(make("p", "manage-empty", error.message));
      showStatus(error.message, "error");
    }
  }
  function renderCalendar() {
    const calendar = $("calendar");
    const selectedRoom = $("calendar-room").value;
    const visible = reservations.filter(
      (reservation) =>
        selectedRoom === "all" || reservation.room === selectedRoom,
    );
    const weekEnd = addDays(week, 6);
    const startDate = toParisInstant(`${week}T12:00`);
    const endDate = toParisInstant(`${weekEnd}T12:00`);
    $("week-title").textContent =
      `${formatDate(startDate, { day: "numeric", month: "short" })} – ${formatDate(endDate, { day: "numeric", month: "short", year: "numeric" })}`;
    $("calendar-summary").textContent = french
      ? `${visible.length} réservation${visible.length === 1 ? "" : "s"} cette semaine${selectedRoom === "all" ? ", toutes salles confondues." : ` · ${rooms[selectedRoom]}.`}`
      : `${visible.length} reservation${visible.length === 1 ? "" : "s"} this week${selectedRoom === "all" ? " across all rooms." : ` · ${rooms[selectedRoom]}.`}`;
    calendar.replaceChildren();
    const today = dateKey(Date.now());
    for (let index = 0; index < 7; index += 1) {
      const day = addDays(week, index);
      const dayStart = toParisInstant(`${day}T00:00`);
      const dayEnd = toParisInstant(`${addDays(day, 1)}T00:00`);
      const section = make("section", "manage-day");
      section.dataset.today = String(day === today);
      const header = make("h4", "manage-day-header");
      header.append(
        make("span", "", formatDate(dayStart, { weekday: "short" })),
      );
      const number = make("time", "", formatDate(dayStart, { day: "numeric" }));
      number.dateTime = day;
      header.append(number);
      header.id = `day-${day}`;
      section.setAttribute("aria-labelledby", header.id);
      const content = make("div", "manage-day-content");
      const entries = visible
        .filter(
          (item) =>
            Date.parse(item.start) < Date.parse(dayEnd) &&
            Date.parse(item.end) > Date.parse(dayStart),
        )
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      if (!entries.length)
        content.append(make("p", "manage-day-empty", t("available")));
      for (const reservation of entries) {
        const card = make("article", "manage-reservation");
        card.dataset.room = reservation.room;
        const startsEarlier =
          Date.parse(reservation.start) < Date.parse(dayStart);
        const endsLater = Date.parse(reservation.end) >= Date.parse(dayEnd);
        card.append(
          make(
            "p",
            "manage-reservation-time",
            `${startsEarlier ? "00:00" : formatTime(reservation.start)} – ${endsLater ? "24:00" : formatTime(reservation.end)}`,
          ),
        );
        card.append(
          make("p", "", rooms[reservation.room] || reservation.room),
          make("p", "", reservation.name),
        );
        addDeleteControl(card, async () => {
          await request(`/reservations/${encodeURIComponent(reservation.id)}`, {
            method: "DELETE",
          });
          showStatus(t("reservationRemoved"));
          await loadReservations();
        });
        content.append(card);
      }
      section.append(header, content);
      calendar.append(section);
    }
  }
  async function loadReservations() {
    const version = sessionVersion;
    const requestId = ++calendarRequest;
    reservations = [];
    calendarLoaded = false;
    renderCalendar();
    $("calendar-summary").textContent = t("loading");
    $("calendar").replaceChildren(make("p", "manage-loading", t("loading")));
    try {
      const from = toParisInstant(`${week}T00:00`);
      const to = toParisInstant(`${addDays(week, 7)}T00:00`);
      const result = await request(
        `/reservations?${new URLSearchParams({ from, to })}`,
      );
      if (!token || version !== sessionVersion || requestId !== calendarRequest)
        return;
      if (!Array.isArray(result.reservations))
        throw new Error(t("invalidResponse"));
      reservations = result.reservations;
      calendarLoaded = true;
      renderCalendar();
    } catch (error) {
      if (!token || version !== sessionVersion || requestId !== calendarRequest)
        return;
      $("calendar").replaceChildren(
        make("p", "manage-empty", t("calendarError")),
      );
      $("calendar-summary").textContent = "";
      showStatus(error.message, "error");
    }
  }
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!apiBase) return;
    const button = $("login-button");
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = t("signingIn");
    clearStatus();
    const password = $("password").value;
    $("password").value = "";
    try {
      const result = await request("/auth/login", {
        method: "POST",
        body: { role, password },
        privateRequest: false,
      });
      const expires = Date.parse(result.expiresAt);
      if (
        typeof result.token !== "string" ||
        !result.token ||
        result.role !== role ||
        !Number.isFinite(expires) ||
        expires <= Date.now()
      )
        throw new Error(t("invalidResponse"));
      token = result.token;
      sessionVersion += 1;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(
        () => endSession(t("sessionExpired")),
        Math.min(expires - Date.now(), 2147483647),
      );
      loginPanel.hidden = true;
      authenticatedPanel.hidden = false;
      $("session-message").textContent = french
        ? `Connecté · session jusqu’à ${formatTime(expires)} (Paris).`
        : `Signed in · session until ${formatTime(expires)} (Paris).`;
      clearStatus();
      if (page === "seminars") {
        await loadSeminars();
        $("speaker").focus();
      } else {
        setReservationDefaults();
        await loadReservations();
        $("calendar-room").focus();
      }
    } catch (error) {
      showStatus(error.message, "error");
      $("password").focus();
    } finally {
      button.disabled = !apiBase;
      button.textContent = t("signIn");
    }
  });
  $("logout-button").addEventListener("click", () => {
    // Revoke the server session while clearing private data immediately.
    const revoke = token
      ? request("/auth/logout", { method: "POST" }).catch(() => undefined)
      : Promise.resolve();
    endSession();
    showStatus(t("signedOut"));
    void revoke;
  });
  if (page === "seminars") {
    $("refresh-seminars").addEventListener("click", () => {
      if (token) void loadSeminars();
    });
    $("seminar-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("seminar-submit");
      if (button.disabled || !token) return;
      const form = event.currentTarget;
      try {
        const fields = new FormData(form);
        const body = {
          speaker: fields.get("speaker").trim(),
          institution: fields.get("institution").trim(),
          title: fields.get("title").trim(),
          date: toParisInstant(fields.get("date")),
          room: fields.get("room").trim() || "Room W",
          abstract: fields.get("abstract").trim(),
        };
        setBusy(button, true, "publishSeminar");
        await request("/seminars", { method: "POST", body });
        form.reset();
        showStatus(t("seminarPublished"));
        await loadSeminars();
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        setBusy(button, false, "publishSeminar");
      }
    });
  } else {
    $("previous-week").addEventListener("click", () => {
      if (token) {
        week = addDays(week, -7);
        void loadReservations();
      }
    });
    $("next-week").addEventListener("click", () => {
      if (token) {
        week = addDays(week, 7);
        void loadReservations();
      }
    });
    $("current-week").addEventListener("click", () => {
      if (token) {
        week = mondayFor(dateKey(Date.now()));
        void loadReservations();
      }
    });
    $("refresh-reservations").addEventListener("click", () => {
      if (token) void loadReservations();
    });
    $("calendar-room").addEventListener("change", () => {
      if (calendarLoaded) renderCalendar();
      if ($("calendar-room").value !== "all")
        $("reservation-room").value = $("calendar-room").value;
    });
    setReservationDefaults();
    $("reservation-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("reservation-submit");
      if (button.disabled || !token) return;
      const form = event.currentTarget;
      try {
        const fields = new FormData(form);
        const start = toParisInstant(fields.get("start"));
        const end = toParisInstant(fields.get("end"));
        const duration = Date.parse(end) - Date.parse(start);
        if (duration <= 0 || duration > 86400000)
          throw new Error(t("invalidInterval"));
        const body = {
          room: fields.get("room"),
          name: fields.get("name").trim(),
          start,
          end,
        };
        setBusy(button, true, "saveReservation");
        await request("/reservations", { method: "POST", body });
        week = mondayFor(dateKey(start));
        showStatus(t("reservationSaved"));
        await loadReservations();
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        setBusy(button, false, "saveReservation");
      }
    });
  }
  function setReservationDefaults() {
    const suggestedStart = Math.ceil((Date.now() + 60000) / 1800000) * 1800000;
    const toLocalInput = (instant) => {
      const parts = parisParts(instant);
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    };
    $("reservation-start").value = toLocalInput(suggestedStart);
    $("reservation-end").value = toLocalInput(suggestedStart + 3600000);
  }
  window.addEventListener("pagehide", () => endSession(null, false));
  if (!apiBase) {
    $("login-button").disabled = true;
    $("password").disabled = true;
    showStatus(t("unavailable"), "error");
  }
})();
