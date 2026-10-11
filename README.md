# Centre Sciences des Données · ENS–PSL

A static, responsive English website with complete French translations at `/fr/`. It includes the centre’s mission, a portrait gallery of the principal investigators, visitor information, a searchable seminar archive, and an automatically selected next-seminar announcement. Each main page has a different openly licensed ENS photograph, displayed with subdued opacity.

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

## Seminar management

End users do **not** need a GitHub account, Cloudflare account, or personal access token. Organisers open `/admin/` (French: `/admin/?lang=fr`) and enter the shared seminar password to add or remove a seminar. GitHub access is an administrator concern: the private API holds a repository credential on the server and makes seminar commits on the organisers’ behalf.

Passwords are sent over HTTPS and checked against **salted one-way hashes**. Neither the plaintext password nor its hash is included in the public website. The sign-in session is short-lived and stays only in page memory; signing out revokes it on the server. Anyone with the shared organiser password can add or remove a seminar.

A small Cloudflare Worker and D1 database in `worker/` provide password verification, revocable sessions and login throttling. **They must be deployed and configured separately before seminar management works.** Until then, the public website remains usable and the administration page clearly explains that sign-in is unavailable.

See [private API setup](worker/README.md) for deployment instructions. Cloudflare’s paid Workers plan is required for the password-verification CPU budget; the public site’s build and Pages workflow create no paid resource.

The API uses HTTPS, strict origin checks, input and request-size limits, durable login throttling and safe rendering of submitted text. Seminar updates commit the JSON file through a narrowly scoped server-side GitHub token, with conflict-safe retries. No password, hash, GitHub token or signing secret is published in the website or repository.

## Room agenda

The hidden `/reservations/` page provides a visual four-room agenda with week, day, month, rooms and list views. Bookings are kept in the separate private `CSDUlm/csd-room-reservations` repository. Users unlock it with one shared password and do not need GitHub accounts. The password is never stored; a dedicated, restricted booking credential is encrypted with AES-256-GCM and a randomly generated high-entropy password. Sessions stay in page memory for 30 minutes.

The private repository has been initialized. **An administrator must create a dedicated fine-grained token and run local setup before the agenda can be unlocked.** See [agenda deployment and security](docs/reservations.md). The published page stays locked and clearly reports unconfigured access until then. All password holders share authority over all bookings and can recover the booking credential; its scope must be limited to the private booking repository. Password rotation requires token revocation as well.

Seminar management retains its separately configured private API. The seminar venue defaults to **Room W**.

## Verification and licenses

Tests cover authentication, revocation, expiry, malformed input, origin checks, throttling, GitHub write conflicts, historical data precision, next-seminar selection, French navigation, safe rendering and Paris daylight-saving transitions. The build verifies local links and portrait assets before publishing.

Website code: [MIT](LICENSE). The five ENS page photographs have separate Creative Commons licenses (CC BY-SA 1.0, 3.0 and 4.0, and CC0 1.0), recorded alongside their source links and photographers in `data/content.json` and [image sources](docs/sources.md). Each page credits its own photograph, links to its license and identifies resizing and cropping. The optimized image files retain their respective licenses.

The PI portraits have individual provenance and credits recorded in [portrait sources](docs/pi-portraits.md). They are separate from the website’s software license.
