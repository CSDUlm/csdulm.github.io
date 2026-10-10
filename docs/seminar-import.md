# Seminar programme imported from the supplied Word document

The user-supplied **CSD – Séminaire, GT et colloquium** document was read on **10 October 2026** and reconciled with the original CSD website archive. The original document stays outside the repository. Its SHA-256 digest is `1dca9795149f4b570768941137cd9e7f7622167df637b71f2752236fa7671fc3`.

## Result

| Measure | Records |
| --- | ---: |
| Previous public website archive | 91 |
| Dated named events recovered from the document | 112 |
| Added events | 44 |
| Existing events enriched or reconciled | 68 |
| Final seminar database | 135 |
| Upcoming events on 10 October 2026 | 8 |
| Upcoming entries explicitly tentative | 3 |
| Named cancelled events retained in the archive | 1 |

The added programme includes seminars, working groups and colloquia omitted from the older website, two separately dated Maarten de Hoop lectures, and eight upcoming events. Duplicate events with matching speakers and dates were merged; richer titles and affiliations from the public archive were retained when the document supplied only a speaker’s name. The June 2024 “Martin de Hoop” spelling was reconciled with Maarten de Hoop using the same document and the CSD visiting-professor list, without creating a second record for that lecture.

Two joint sessions now retain their separate speaker/title pairs in `talks`, as do other joint sessions whose document gives both titles. Ashok Vardhan’s explicit abstract is also preserved.

## Upcoming programme

All times are Paris local time. “Room W” is the user-requested default, with `roomKnown: false` because the document does not individually confirm these rooms.

| Date | Time | Speaker | Status |
| --- | --- | --- | --- |
| 15 October 2026 | 11:00 | Nicolas Schreuder | Tentative; title to be announced |
| 22 October 2026 | 11:00 | Jerome Garnier Brun | Scheduled; title to be announced |
| 29 October 2026 | 11:00 | Marc Lelarge | Scheduled colloquium; title to be announced |
| 5 November 2026 | 11:00 | Xiaoming Yuan | Scheduled seminar; title to be announced |
| 10 November 2026 | 11:00 | Pierre Gentine | Scheduled Tuesday colloquium; title to be announced |
| 12 November 2026 | 11:00 | Antonin de Courcel | Tentative; “Effective models in high dimensional unstable regimes: optimization dynamics at the edge of stability” |
| 3 December 2026 | 11:00 | Alexander Mathis | Scheduled colloquium; title to be announced |
| 8 December 2026 | 14:00 | Steven L. Brunton | Tentative; explicit Tuesday afternoon exception; title to be announced |

## Precision and unresolved details

- Academic-year headings supply the year for `DD/MM` dates: September–December use the first academic year; January–July use the second.
- The document explicitly sets the 2026–2027 Thursday schedule to 11:00–12:00 and Tuesday schedule to 11:00–12:00. This supports the recorded start times for the current-year dated events. Each such record has a `timeSource` identifying this schedule-derived precision. The Steven L. Brunton event has its own explicit 14:00 start.
- Specific historical start times are imported only where explicit: Andrea Montanari on 17 October 2023 at 12:30, Florent Krzakala on 14 March 2024 at 12:00, and the four June 2026 sessions explicitly listed at 12:00–13:00. Other historical times remain unknown.
- The document explicitly replaces the 19 October 2023 row with Andrea Montanari on 17 October, and the 16 November row with Antoine Maillard on 14 November. These match the public website’s actual event dates.
- Eugène Ndiaye’s 23 April 2026 event is marked `status: "cancelled"`; the separate 19 March event remains in the archive. Cancelled events must not appear as the next upcoming talk.
- Three upcoming rows use `status: "tentative"`: Nicolas Schreuder, Antonin de Courcel and Steven L. Brunton. Tentative status is independent of whether a title is known.
- A January 2027 suggestion for Nicolas Mil-Homens Cavaco supplies a title and “Louvain” but no day. It is excluded from the dated programme rather than assigned an invented date.
- The late-2022 François Charton, Mathieu Wyart and Rémi Monasson dates were not addressed by this document. Their previously flagged published dates remain unchanged pending archival verification.
- The document contains conflicting 16/17 December 2026 special-time notes but no named speaker on that row. No seminar is created from it.
- Spellings that cannot be resolved confidently remain as supplied, including “Damien Rouchousse”, “Batiste Le bars”, “Rebecca Willet”, “Lenaic Chizat” and “Antonin de Courcel”. Incomplete names “Gabriel”, “Malick” and “M. Jordan” are retained without unsupported expansion.

## Excluded material and reproducibility

The public database contains only event information. Internal email addresses, mailing instructions, confirmed absences, host assignments, office-use notes, personal contact details, speaker suggestions, empty slots, holiday breaks and unassigned cancellations are excluded. A Sigma conference and a CSD thematic day without a named speaker are also excluded from the seminar list.

`scripts/import-seminars-docx.py` reproduces the reconciliation from the supplied document. It reads the public columns, resolves the academic years and documented replacement dates, merges by date and speaker, and writes a summary. Run it with the bundled Codex Python runtime and the document’s local path; do not add the original document to Git.
