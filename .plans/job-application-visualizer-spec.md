# Job Application Visualizer — Spec

## 1. Purpose

A local dashboard that reads one job-tracker CSV and answers **"How is my funnel doing?"** The app counts only real applications. Rows that are saved, skipped, wishlisted, or unclear are not counted.

Problem it solves: trackers like Simplify export saved and skipped jobs in the same file as applied jobs. Other importers count all of those rows as applications, so the totals come out too high.

## 2. Delivery and runtime

| Item | Decision |
|---|---|
| Form | One self-contained `index.html` file. You open it in a browser. No build step and no server. |
| Input | Drop **one or two CSVs** (or use the file picker). The app keeps at most one file per format. Dropping a file of a format that is already loaded replaces it. |
| Merging | **Revised after reading the samples:** both files are merged into one list and duplicates across the two files are removed (§3.3). Neither file is complete on its own. |
| Privacy | All parsing happens in the browser. The only network calls load pinned libraries from a CDN. |
| Persistence | The raw text and filename of each loaded file are saved in `localStorage` and loaded again on the next visit. Every read and write is wrapped in try/catch. A "Clear" control deletes the saved data. |
| Libraries | Papa Parse 5.4.1, d3 7.9.0, d3-sankey 0.12.3. All pinned and loaded from a CDN. |

## 3. Supported CSV formats

### 3.1 Column profiles

| Field | Simplify (`Simplify_Tracked_Jobs_*.csv`) | ApplyTwin (`applytwin-applications*.csv`) |
|---|---|---|
| How the format is detected | Has the headers `Company Name` and `Applied Date` | Has the headers `Company`, `Role`, `Site` |
| Company | `Company Name` | `Company` |
| Role | `Job Title` | `Role` |
| Status | `Status` | `Status` |
| Date applied | `Applied Date` (`YYYY-MM-DD`, or `N/A` for saved rows) | `Date` (`YYYY-MM-DD HH:MM`). **Not trustworthy when `Notes` starts with "From your history"**: those rows carry the import time, not the apply date. Treat them as having no date. |
| Status date | `Status Date` | — |
| Link | `Job URL` | `Link` |
| Other | `Location`, `Archived`, `Date Archived`, `Notes` (all empty in the sample), `job_type` | `Location`, `Site` (the applicant tracking system), `Notes` (the agent log), `Resume` |
| Interview signal | None. There is no history or notes column. `SCREENING` is the only status that comes after applying. | None. The file has no outcome data. |

Any other file falls back to fuzzy header matching:

- `company|employer` → Company
- `title|role|position` → Role
- `status|stage` → Status
- `applied|date` → Date applied

If no Status column is found, show an error.

### 3.2 Status values found in the samples

- Simplify: `APPLIED`, `SAVED`, `REJECTED`, `SCREENING` (others such as `INTERVIEWING` and `OFFER` are also recognized).
- ApplyTwin: `Applied`, `Skipped`, `Needs User`.

### 3.3 Merge and dedupe rules (revised)

Every row from every loaded file is grouped by job. **One group is one application.** Rows inside the same file are grouped too, because ApplyTwin often lists one job several times.

1. **Posting ID from the link.** Rows with the same ID are the same job. Rows with different IDs are **never** merged, because they are different postings (for example, KLA Milpitas vs Ann Arbor).
   - Workday: the requisition number at the end of the path. The `-1`/`-2` suffix is dropped, because it is the same requisition on another job board.
   - Ashby/Lever: the UUID in the path.
   - Greenhouse and others: the `gh_jid`/`token`/`rid` query parameter, or a numeric path segment of 5+ digits.
2. **Same exact link.** Bare homepages do not count.
3. **Rows with no posting ID** (shortlinks like `go.vansh.nyc` and `simplify.jobs/click`, or homepages) join a group with the same company and the same normalized role. Normalizing the role ignores word order, "engineering" vs "engineer", years and seasons, and parenthesized text. When several groups match, the row joins the one with the most location overlap.
- **Status:** the most advanced status in the group wins (offer > rejected > screen > withdrawn > applied).
- **Date:** the earliest real apply date in the group.
- **Known limit:** two Simplify rows with the same company and role that both have only `simplify.jobs/click` links are merged, even if they were separate postings.

### 3.4 What's new on each upload

- After each upload, the app saves a snapshot of the merged applications: their identity keys and their status from the CSV.
- On the next upload, the "What's new" card lists **new applications** and **status changes** (old status → new status), compared with that snapshot.
- If nothing changed, the card says "Nothing new." The card stays visible until you dismiss it.
- A new export of a format that is already loaded replaces the older file of that format.

### 3.5 Manual status edits

- "Edit statuses" opens a search over every job, including excluded ones. You can set Applied, Screen / interview, Offer, Rejected, Withdrawn or Not applied.
- Edits are saved in `localStorage` and keyed by the job's identity keys.
- An edit is **dropped automatically** when the CSV's own status for that job changes, because the CSV then has newer information.
- Clear removes the loaded files and the snapshot, but keeps your edits.

## 4. Rule for deciding whether a row is an application (strict)

A row counts as an application **only if its status shows that you applied, or that the process went further than applying.** Every other row is excluded.

| Bucket | Example status values (complete this list from the samples) | Counted? |
|---|---|---|
| Applied | applied, submitted, application sent | Yes |
| In process | screening, OA, assessment, phone, interview, onsite, final round | Yes |
| Withdrawn | withdrawn, withdrew | Yes (shown as its own gray outcome) |
| Offer | offer, accepted, declined offer | Yes |
| Rejected | rejected, not selected, no longer under consideration | Yes |
| Not applied | saved, bookmarked, wishlist, interested, skipped, **needs user** (ApplyTwin: the form was not submitted), not interested | **No** |
| Empty or unknown | blank, or any value not in this table | **No (strict)** |

- A filled-in "date applied" field **does not** make a row count by itself. The status decides. This is your strict choice.
- Excluded rows are **hidden completely.** They do not appear in any chart, total, or list.
- The only place they appear is a chip for each file, for example `Simplify · 40 of 52 rows`, plus one line for the merge result. This lets you check that the filter did something without showing the rows themselves.
- A status value that is not recognized is treated as "not applied." Log it to the console so the mapping can be extended later.

## 5. Outcome model for counted applications

Each counted row gets exactly one outcome:

| Outcome | Rule |
|---|---|
| **Offer** | The status is in the Offer bucket. |
| **Interviewed → Rejected** | The status is Rejected **and** an interview signal exists (an interview-date column has a value, a stage-history column mentions an interview, or the notes contain interview/onsite/final). |
| **Interviewing** | The status is in the In process bucket. |
| **Rejected** | The status is Rejected and there is no interview signal. |
| **Waiting** | The status is Applied, and the row was applied less than 30 days ago. |
| **Ghosted** | The status is Applied, and the row was applied 30 days ago or more. |

- The ghosted cutoff is **fixed at 30 days**, counted from the date applied. If the row has no date applied, use the date added instead. If neither date exists, the outcome is "Waiting."
- The reference date for the cutoff is today.
- If interview signals are not available in a file, rejections go straight from Applied to Rejected. This is expected behavior, not a bug. Neither sample file has interview signals.
- Rows that exist only in ApplyTwin are **treated like Simplify Applied rows** (your choice): they go through the 30-day Waiting/Ghosted rule. Undated "From your history" rows always count as Waiting.
- When an ApplyTwin file is loaded, a note under the Sankey says that outcomes come only from Simplify.

## 6. Layout

The page has one column with a maximum width of about 1100px, centered. It has these parts, from top to bottom:

1. **Header bar**
   - Left: the app name and the loaded file name, with the count line from §4.
   - Right: the date-range presets and a "Load another CSV" button.
2. **KPI row.** Four stat tiles:
   - Applied: the total count.
   - Response rate: (Rejected + Interviewing + Interviewed→Rejected + Offer) ÷ Applied.
   - Interviews: Interviewing + Interviewed→Rejected + Offer.
   - Offers.
   - Each tile shows the number, its label, and a percent of Applied where that makes sense.
3. **Pipeline Sankey.** This is the main chart.
   - Applied → {Waiting, Ghosted, Rejected, Interview}
   - Interview → {Interviewing, Rejected after interview, Offer}
   - Node labels show the name and count.
   - Hovering a link shows a tooltip with the count and its percent of Applied.
   - Do not draw a node or link that has a count of zero.
4. **Activity calendar.** A GitHub-style grid with one cell per day the row was applied (week columns × weekday rows).
   - The grid covers the selected date range. For "All time," it covers the earliest to the latest applied date.
   - Color uses a single-hue sequential ramp with 4–5 steps.
   - Hovering a cell shows the date and the count.
   - Under the grid: the busiest day, the current applying streak, and the average applications per week.
5. **Empty state.** When no file is loaded, show a large drop zone with one line of explanation: "Drop a Simplify or tracker CSV. Nothing leaves your browser."

There is no searchable table, no breakdown bars, no response-time metric, no click-through to rows, and no PNG export. You declined all of these.

## 7. Date-range filter

- Presets: **All time · This season · Last 90 days · Last 30 days.**
- "This season" runs from **Aug 1 to Jul 31.** The current season is the one that contains today. For 2026-11-03, that is 2026-08-01 to today.
- The filter uses the date applied. Rows with no real date are counted only under All time. When another preset hides them, a note says how many were left out.
- The calendar never shows undated rows. A note under it says how many are missing.
- The filter changes the KPIs, the Sankey, and the calendar together.
- The selected preset is saved in `localStorage` as a convenience for each viewer.

## 8. Visual design: calm and minimal, dark only

- **Dark mode only.** No light theme and no toggle.
  - Page background: `#0d0d0d`.
  - Card surface: `#1a1a19`.
  - Hairline borders: `rgba(255,255,255,0.10)`.
  - Primary text: `#f0efec`. Secondary text: `#c3c2b7`. Muted text: `#898781`.
- Font: the system sans (`system-ui, -apple-system, …`). Use tabular numerals only where numbers sit in aligned columns.
- Generous whitespace. Thin marks. Gridlines are recessive solid hairlines. Text is never drawn in a series color.
- **Sankey colors.** The five-hue version failed the colorblind check: violet and blue measured ΔE 1.9 for protan. These colors pass the dark-mode, all-pairs check:

  | Node | Color |
  |---|---|
  | Applied | blue `#3987e5` |
  | Screening / interview / offer (the "progress" path) | aqua `#199e70` |
  | Rejected | orange `#d95926` |
  | Waiting | light gray `#8f8e88` |
  | Ghosted | dark gray `#4a4946` |
  | Withdrawn | dark gray `#4a4946` |

  - Every node also has a direct text label, so color is never the only way to tell nodes apart.
  - Links use the color of their target node at about 35% opacity, and about 65% on hover.
- **Calendar ramp:** blue sequential steps from `#184f95` (fewest) to `#86b6ef` (most). Empty days use `#232322`.
- The layout must work at phone width: a 16px side gutter, no horizontal scrolling, KPI tiles wrapping into a 2×2 grid, and the calendar scrolling horizontally inside its own card only.

## 9. Edge cases

- **Dates in several formats:** ISO, `MM/DD/YYYY`, `Mon DD, YYYY`, and timestamps. A date that cannot be parsed counts as missing.
- **Byte-order mark (BOM) and CRLF line endings:** strip them.
- **Quoted fields with commas or newlines:** Papa Parse handles these.
- **Status text:** trim it and match it case-insensitively. Treat "Applied ✓" and "applied" as the same value.
- **Duplicates inside one file:** count each row (there is no dedupe in v1).
- **A CSV with no counted rows:** show the message "No applications found — 0 of N rows had an applied-or-later status." Also list the distinct status values that were found, so the mapping can be fixed.
- **A large file (about 5k rows):** it must render in under 1 second.

## 10. Out of scope (v1)

A light theme, breakdown charts, a table view, response-time metrics, image export, and hosting.

## 11. Open items

None. The sample files were read, and the palette was validated on 2026-11-03.
