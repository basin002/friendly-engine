# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is not a conventional software project — there is no package manager, build step,
test suite, or linter. It is the operations repo for **R&R Machinery Moving Co** and its
sister used-equipment business **Source Machinery** (owner: Brent Basinski). It holds
agent skills, a business-intelligence data model with seed data, a Google Apps Script,
and self-contained HTML tools.

## Layout

- `skills/lead-autopilot/SKILL.md` — Claude skill that triages inbound replies to
  outreach campaigns, labels Gmail threads, and drafts replies in Brent's voice.
- `intel/DATA-MODEL.md` — the pipeline-intelligence data model (entities: Company,
  Site, Machine, Movement, Contact, Photo, Signal) and the reasoning behind it. Read
  this before touching anything in `intel/`.
- `intel/accounts-seed.json` — seed records extracted by hand from real work orders and
  email threads. Every field came from an actual document; nothing is estimated.
- `intel/apps-script/SavePhotosToDrive.gs` — Gmail attachment harvester. Deployed
  manually to script.google.com, not executed from this repo. `setUp()` runs once and
  creates the Drive folder, index sheet, Gmail label, and an hourly trigger for
  `harvest()`. Idempotent: processed threads get the `Intel-PhotosSaved` label and are
  excluded from later searches.
- `quote-calculator.html` — instant-quote calculator for machinery-moving jobs.
  Editable rates persist in `localStorage`.
- `lead-dashboard.html` — a generated static snapshot of a lead-triage run (no
  JavaScript; content is baked in when produced).

## Working here

**Viewing/testing the HTML tools:** open the file in a browser. Both are single-file,
dependency-free pages — keep them that way (no CDNs, no external assets).

**HTML styling convention:** CSS custom properties on `:root`, with dark mode supported
three ways in every file: `@media (prefers-color-scheme: dark)` plus explicit
`:root[data-theme="dark"]` and `:root[data-theme="light"]` override blocks. Shared
palette style: warm paper background (`#f2f0ea`), Georgia serif headings, monospace
eyebrows/labels. Match this in any new page.

**Apps Script:** plain Google Apps Script conventions — `function name_()` trailing
underscore for private helpers, `CONFIG` object at the top, respect the 6-minute
execution limit via `TIME_BUDGET_MS` and per-run thread caps.

## Domain rules that constrain code and data changes

These come from `DATA-MODEL.md` and the lead-autopilot skill and apply to any work in
this repo, including future automation:

1. **Never send email from automation — draft only.** Drafts go to Gmail for Brent to
   review, even if a scheduled run is told to "just send it".
2. **Never state prices or commercial terms in customer-facing drafts**, even when the
   number exists in an internal thread. Internal figures in `accounts-seed.json` are
   marked as not confirmed sent to customers — keep that distinction.
3. **Never invent job facts** (weights, dimensions, access details). If it isn't in a
   source document, it doesn't go in the data.
4. **Photos and binaries are never committed to this repo.** They live in Google Drive
   (`MachineIntel/{company-slug}/{machine-id}/`); the data model stores only the
   `drive_file_id` pointer and extracted text.
5. **Quote evidence verbatim.** Signal records keep the customer's actual words in
   `evidence` — never paraphrase them away.
6. **Extract, don't collect.** No new intake forms; parse the documents that already
   flow (Actsoft CSVs, Molly's quote emails, reply threads).

## Planned direction

Storage for the intel database is intended to be **a single SQLite file committed to
this repo** (not Postgres/Airtable/a CRM) — see the Storage section of
`intel/DATA-MODEL.md`. `accounts-seed.json` is the proof of the model, not the final
store. A known constraint: the agents' Gmail access exposes attachment metadata but not
contents, which is why the Apps Script harvester exists.
