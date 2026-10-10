# Centre Sciences des Données · ENS–PSL

A static, responsive English website with complete French translations at `/fr/`. It includes the centre’s mission, hosted teams, visitor information, a searchable seminar archive, and an automatically selected next-seminar announcement. The licensed ENS courtyard photograph appears with subdued opacity.

## Run locally

Use Node.js 22.13 or newer. The public site has no third-party dependencies.

```sh
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4175/`. The generated `dist/` directory is the complete deployable website. Its contents include only public HTML, scripts, styles, images and seminar data; the private API and documentation are never packaged into it.

## Seminar database

`data/seminars.json` is a UTF-8, versioned JSON database reviewed in Git. `data/content.json` contains bilingual centre information and source links. The schema is:

```json
{
  "version": 1,
  "timezone": "Europe/Paris",
  "seminars": [{
    "id": "unique-stable-id",
    "speaker": "Speaker name",
    "institution": "Institution",
    "title": "Talk title",
    "date": "2026-10-15T11:00:00+02:00",
    "room": "Room W",
    "timeKnown": true,
    "roomKnown": true
  }]
}
```

Optional fields include `abstract`, `url`, `type`, `titleKnown`, `status` and source provenance. Dates must include a timezone for new talks. Old talks with no individual published time retain a day-only date and `timeKnown: false`. Unknown historical rooms remain null. Tentative events are labelled explicitly. A new talk’s room defaults to **Room W**. The homepage chooses the next future record in Paris time, while the seminar page lists every upcoming event and offers search, year filters, abstracts and source links for the archive. Original research titles are retained in their source language on both translated interfaces.

See [content sources and image license](docs/sources.md) for the previous website, the supplied seminar document, and archival uncertainties.

## Publishing

`.github/workflows/pages.yml` runs the checks, builds the site and publishes `dist/` to GitHub Pages on a push to `main`. Set the repository’s Pages publishing source to **GitHub Actions**. The default URL is `https://csdulm.github.io/`.

Repository Actions variables:

| Variable | Purpose |
| --- | --- |
| `CSD_API_URL` | HTTPS URL of the deployed private API. Omit until that API is configured. |
| `CSD_SITE_URL` | Canonical website origin; defaults to `https://csdulm.github.io`. |

Changing a variable requires rerunning the publishing workflow. For local API development, set `CSD_API_URL` when building; localhost HTTP is allowed only for local preview.

## Private management

Seminar organisers use `/admin/`. Room bookings use the unlisted `/rooms/` page (French: append `?lang=fr`). The room page is omitted from navigation and the sitemap and marked `noindex`. Its HTML contains no reservations. Hiding a URL is not the security boundary: the API requires authentication for every reservation read, addition and deletion.

Static hosting cannot securely validate passwords or maintain private shared bookings. A small Cloudflare Worker and private D1 database in `worker/` provide those functions. **They must be deployed and configured separately before management works.** Until then, the site explicitly disables sign-in and remains fully usable as a public static website. No successful save is simulated.

See [private API setup](worker/README.md) for exact deployment instructions. Cloudflare’s paid Workers plan is required for the password-verification CPU budget; no paid resource is created by the public site’s build or Pages workflow.

Security measures include:

- Two separate access passwords, stored only as salted server-side hashes. No password, hash, GitHub token or signing secret is published in the website or repository.
- Short-lived, role-limited sessions held only in page memory, never browser storage. Reloading closes the frontend session; sign-out revokes it server-side.
- HTTPS, strict origin checks, input and request-size limits, durable login throttling, and safe rendering of submitted text.
- Private reservation storage, database-enforced overlapping-booking prevention, and explicit confirmation before removing an entry.
- Seminar updates commit the JSON file through a narrowly scoped server-side GitHub token, with conflict-safe retries. Reservations never enter the public repository.

Anyone with the corresponding shared password can remove that role’s entries. If individual accountability or per-person deletion permissions are needed later, replace shared passwords with ENS identity-provider accounts.

## The four rooms

| Identifier | Display name |
| --- | --- |
| `reunion` | Salle réunion |
| `reunion-bis` | Salle réunion bis |
| `visio-cafe` | Salle visio café |
| `visio-couloir` | Salle visio couloir |

The private interface shows a weekly calendar with room filters and a mobile agenda. It accepts the person reserving, room, start and end; times are interpreted in Europe/Paris regardless of the browser’s timezone. Overlapping slots are rejected atomically, while adjacent reservations and simultaneous bookings in different rooms are permitted.

## Verification and licenses

Tests cover authentication, roles, revocation, expiry, malformed input, origin checks, throttling, concurrent reservation overlap, GitHub write conflicts, historical data precision, next-seminar selection, French navigation, safe rendering and Paris daylight-saving transitions.

Website code: [MIT](LICENSE). The ENS courtyard photograph is separately licensed [CC BY-SA 1.0](https://creativecommons.org/licenses/by-sa/1.0/), by David Monniaux. The visible credit links to the [original Wikimedia file](https://commons.wikimedia.org/wiki/File:ENS_Ulm_cour_Ernests_DSC00106.jpg). It is displayed with CSS crops and reduced opacity; the original licensed image remains in the repository.
