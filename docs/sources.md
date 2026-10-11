# Content provenance and image credit

Retrieved on 10 October 2026. The migration uses public pages of the previous CSD website as the primary source. Presentation prose has been edited for clarity in English and translated into French. Names, talk titles, event dates and profile links are preserved from the source unless explicitly noted below. The user added Julie Delon, Irène Waldspurger, Nicolas Schreuder and Yann Ollivier as principal investigators on 10 October 2026, and subsequently Eddie Aamari. Amaury Hayat was added at the site owner’s request on 11 October 2026. Their profiles and the portrait gallery are documented in [portrait sources](pi-portraits.md). PI email addresses are omitted from the gallery and public data at the site owner's request.

## CSD information

- [Presentation of the Centre Sciences des Données](https://csd.ens.psl.eu/?presentation-du-cdd): mission, interdisciplinary focus, connections with ENS/PSL/PRAIRIE, supporters, and location on the third floor of the main ENS building between staircases B and C at 45 rue d’Ulm, 75005 Paris.
- [Members of the centre](https://csd.ens.psl.eu/?Presentation-des-membres): eight hosted team leaders, steering committee, historical invited professors and their profile URLs. The presentation article still refers to four teams while the members page lists eight team leaders; the new site uses the named list and avoids asserting a team count from the older prose.
- [Mailing list of the centre](https://csd.ens.psl.eu/?mailing-list-of-center): public [mailing-list signup form](https://docs.google.com/forms/d/e/1FAIpQLSfSuPd-zngJt9N_wJvjiz2V3oFc4uTsdWqwH5-RZC0yspByXQ/viewform).
- [CSD courses](https://csd.ens.psl.eu/?csd-courses): purpose of the courses and historical Eric Vanden-Eijnden and Matthew Colbrook lecture series. The Colbrook series explicitly ends in April 2022. The June Vanden-Eijnden lectures omit a year; 2022 is inferred from the article date and matching weekdays. These are historical records, not current announcements.
- [PhD seminar](https://csd.ens.psl.eu/?phd-seminar): interactive paper presentations, classes and tutorials, welcoming students beyond the centre. The page's Mondays 12:00–13:00 schedule and “next seminar” label are historical and should not be advertised as a verified current schedule.
- [DIENS visitor information](https://www.di.ens.fr/information): independently confirms the CSD location between staircases B and C on the third floor.

The source's steering-committee profile link for Gabriel Peyré accidentally points to Erwan Allys. The migration uses Gabriel Peyré's own profile URL, already listed under hosted teams.

## Seminar database

[data/seminars.json](../data/seminars.json) initially recovered all **91** entries from the [CSD seminar archive](https://csd.ens.psl.eu/?csd-seminar-webpage), covering **16 December 2021 to 2 April 2026**. It now contains **135** records after reconciliation with the user-supplied **CSD – Séminaire, GT et colloquium** Word document, which covers academic years 2023–2024 through 2026–2027. See [the import report](seminar-import.md) for the added programme, richer titles, precision and exclusions.

Each record has a stable identifier, speaker, institution, title, ISO date, room and event type. The original entry is retained in `sourceText`, and `url` links to its source. A UTF-8 JSON file keeps the data easy to edit, review in Git and validate before publication.

On 11 October 2026, the site owner supplied 20 missing talk titles for 17 sessions between 27 November 2025 and 25 June 2026. These corrections are recorded in each updated entry's `sources`. The three joint sessions retain separate speaker/title pairs in `talks`. The missing initial letters in Fabian Schaipp's “The Surprising Agreement…” and Jérôme Bolte's “Optimization Perspectives…” were restored. Dates, affiliations, original source text and event statuses are unchanged. The supplied list places Eugène Ndiaye's title on the cancelled 23 April entry; the separate 19 March entry remains without a confirmed title. Original-announcement links are omitted from the seminar pages in both languages, while source URLs remain in the database for provenance.

Historical precision is preserved:

- The original website dates were day-only values (`YYYY-MM-DD`) with `timeKnown: false`. The old page’s “usually Thursdays, 14:00–15:00” schedule is historical and has been superseded for academic year 2026–2027 by the supplied document’s Thursday 11:00–12:00 schedule. Only events explicitly covered by that current schedule, and individual events with an explicit time, receive a full ISO timestamp. `timeSource` records whether a time comes from the general schedule or an event-specific exception.
- Institutions appear only where supplied in either source. Empty strings represent missing affiliations.
- Entries labelled only “Séminaire”, “GT”, “GT théorie” or “Colloquium” have `titleKnown: false` and the display value “-”. Their event type is retained separately. Seminar displays place the speaker before the title in both languages.
- The old page identifies the usual venue as the centre's conference room but does not give each event's room. Historical records use `room: null` with `roomKnown: false`. Upcoming events use the user-requested default “Room W” with `roomKnown: false` and `roomSource` explicitly stating that the room was not individually confirmed in the document.
- The old public archive supplied no abstracts. The supplied document includes Ashok Vardhan’s abstract, which is imported without its accompanying private email address. No abstract was generated.
- Three final entries have potentially erroneous years: François Charton is dated **2022/12/9**, Mathieu Wyart **2022/11/26** and Rémi Monasson **2022/11/18**, despite appearing after the December 2021 entries. Those dates are retained exactly as published, with a `sourceNote` flag for future archival verification.
- Source spellings generally remain unchanged, including “Tony Silveti-Falls” and “Antonio Silveti-Falls”, “Loucas-Pillaud Vivien” and “Kruno”. The document supplies enough context to reconcile “Martin de Hoop” with Maarten de Hoop and “Nicolas Scwhreuder” with Nicolas Schreuder; those changes retain the original text and an explanatory note. Incomplete names such as “Gabriel”, “Malick” and “M. Jordan” are not expanded.

## ENS page photographs

Verified on 11 October 2026. Each of the five main pages uses a different real photograph of ENS Ulm in Paris. The English and French versions of a page share the same photograph. Image paths, bilingual captions, photographer credits, original URLs and licenses are recorded under `images` in [data/content.json](../data/content.json).

| Page | Local image | Photographer | Original file and license |
| --- | --- | --- | --- |
| Home | `assets/images/ens-ulm.webp` | David Monniaux | [Wikimedia source](https://commons.wikimedia.org/wiki/File:ENS_Ulm_cour_Ernests_DSC00106.jpg) · [CC BY-SA 1.0](https://creativecommons.org/licenses/by-sa/1.0/) |
| About | `assets/images/ens-courtyard-summer.webp` | Jan Sokol | [Wikimedia source](https://commons.wikimedia.org/wiki/File:ENS_dvur.JPG) · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Members | `assets/images/ens-courtyard-winter.webp` | Evarin | [Wikimedia source](https://commons.wikimedia.org/wiki/File:Cour_aux_Ernests_sous_la_neige.jpg) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Seminars | `assets/images/ens-salle-dussane.webp` | Chabe01 | [Wikimedia source](https://commons.wikimedia.org/wiki/File:Salle_Dussane_%C3%89cole_Normale_Sup%C3%A9rieure_-_Paris_V_(FR75)_-_2025-11-17_-_1.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| Visit | `assets/images/ens-entrance.webp` | LPLT | [Wikimedia source](https://commons.wikimedia.org/wiki/File:Entr%C3%A9e_ENS_45_rue_d%27ulm.JPG) · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

The homepage shows the Cour aux Ernests; About shows the courtyard in summer from another viewpoint; Members shows the snowy courtyard at night; Seminars shows Salle Dussane; Visit shows the entrance at 45 rue d’Ulm. Salle Dussane illustrates the ENS campus; the room listed for each seminar remains the event's venue.

The new local assets are WebP conversions, resized to a maximum width of 1280 pixels without enlargement. The existing homepage WebP is 1024 × 768 pixels, with its original 1280 × 960 JPEG retained for the homepage sharing image. Source originals for the new photographs can be retrieved through their recorded original URLs and are not duplicated in the repository. No image was generated or had its depicted content altered.

The layout applies CSS cropping, reduced opacity and partial grayscale. Captions and visible credits link to the source photograph and its selected license, name the photographer, and indicate resizing and cropping. Each modified CC BY-SA photograph remains available under its original selected license; the winter courtyard photograph is released under CC0 1.0. These image licenses are separate from the repository's software license.
