# Pipeline Intelligence — data model

The goal: turn every work order R&R processes into a permanent, queryable record of
**who owns which machines, what moved when, why, and who decided**. Source Machinery
then sells against knowledge instead of against a list.

## The principle that makes this work

**Extract, don't collect.**

Four intake forms have been built for this and none stuck, because a form asks a human
to do extra work on every job. That tax gets paid for a week and then stops.

The work orders already exist. Actsoft already emails a CSV every morning. Molly already
posts every inbound job to the team with machine model, weight, dimensions, origin,
destination, and contact. The intelligence is already being generated as a byproduct of
running the business — it's just being thrown away after it's read.

So: no new forms. Parse what already flows.

## Entities

### Company
The account. One record per business, not per site.

| Field | Notes |
|---|---|
| `id` | slug, e.g. `precision-air-products` |
| `name` | canonical name; keep an `aliases` list — Actsoft, Gmail, and Molly's emails spell things differently |
| `sites` | one or more physical locations |
| `industry` | fab shop, die casting, printing, plastics, etc. |
| `relationship` | `customer`, `prospect`, `seller`, `both` |
| `first_seen` / `last_seen` | earliest and latest work order date |

### Site
Access conditions are what actually drive price, and they don't change often. Recording
them once means never re-asking.

| Field | Notes |
|---|---|
| `company_id` | |
| `address` | |
| `dock` | `dock`, `ground`, `both` — straight from work order language |
| `access_notes` | door widths, ceiling height, stairs, tight turns, crane needed |
| `verified_on` | date the crew was last physically there |

### Machine
The core asset record. This is the part nobody else has.

| Field | Notes |
|---|---|
| `company_id` | current owner |
| `make` / `model` | e.g. Hardinge / Cobra 65 |
| `serial` | when available — the only true unique key |
| `type` | CNC lathe, press brake, bandsaw, welding cell, injection molder |
| `weight_lbs` / `dimensions` | from the work order, exact |
| `controls` | Fanuc, Haas, etc. |
| `status` | `in_service`, `for_sale`, `sold`, `scrapped`, `in_storage` |
| `acquired_date` / `disposed_date` | inferred from movements |

### Movement
One row per time a machine physically moved. The timeline that reveals patterns.

| Field | Notes |
|---|---|
| `machine_id` | |
| `date` | |
| `direction` | `in`, `out`, `internal`, `scrap`, `storage` |
| `from_site` / `to_site` | |
| `work_order_no` | ties back to Actsoft |
| `price` | what R&R charged |
| `prep_required` | whether the customer had to prep — recurring cost driver |
| `crew` / `equipment_used` | carry deck crane, forklift, etc. |

### Contact
People, with roles. Roles matter more than names — a facilities manager stays a
facilities manager after they change companies.

| Field | Notes |
|---|---|
| `company_id` | |
| `name` / `title` / `phone` / `email` | |
| `role_type` | `decision_maker`, `facilities`, `maintenance`, `purchasing`, `exec` |
| `last_contact` / `last_channel` | |
| `notes` | personal context worth remembering |

### Photo
The most valuable and worst-captured asset in the business. Photos already arrive
constantly as email attachments and die inside threads. Nothing is organized anywhere.

**Photos are never stored in this repo.** Binary files bloat git permanently and can't be
removed cleanly. They live in Google Drive, foldered `MachineIntel/{company-slug}/{machine-id}/`.
The database stores only a pointer and the text extracted from the image.

| Field | Notes |
|---|---|
| `drive_file_id` | the only copy reference — never duplicate the binary |
| `machine_id` | nullable; a photo may arrive before the machine is identified |
| `company_id` / `site_id` | always known, even when the machine isn't |
| `captured_date` | from EXIF where available, else email date |
| `source` | `customer_email`, `crew_phone`, `site_visit`, `actsoft_work_order`, `text_message` |
| `photo_type` | see table below — this drives what gets extracted |
| `extracted` | structured fields read out of the image by vision |
| `confidence` | how sure the extraction is; low confidence gets flagged for a human |

#### Photo types, and what each one unlocks

Not all photos are equal. Type determines what to extract and what it's worth.

| Type | What it unlocks |
|---|---|
| `nameplate` / data plate | **The highest-value photo there is.** Make, model, serial, year, voltage, phase, sometimes weight and hours — read straight off the plate. The serial is the only truly unique key a machine has. |
| `full_machine` | Condition assessment, and a ready-to-publish Source Machinery listing photo. No reshoot needed. |
| `control_panel` | Control make and generation, which moves resale value substantially on the same base machine. |
| `access_path` / `dock_door` / `doorway` | Re-quote that site forever without another visit. Access is the main cost driver and it rarely changes. |
| `in_place` / `rigged` | How the machine was rigged last time — faster, safer, and cheaper the next time, and defensible if anything goes wrong. |
| `damage` / `wear` | Condition of record at a point in time. Protects against disputes and informs honest resale pricing. |

#### Why the nameplate photo is the whole game: provenance

Serial numbers make machines individually trackable across owners. Once serials are in the
record, questions become answerable that nobody else in this market can answer:

- *We moved this exact machine in 2019 — here's what condition it was in and how it was rigged.*
- *This machine has changed hands twice in six years. Why?*
- *This model consistently gets replaced at year eight in this industry. Who bought one in 2018?*

Used machinery is sold on trust and unknowns. A dealer who can produce the documented life
history of a specific serial number is not competing on price. Note the Artiforge thread
from March, where the customer said their own machine documentation "isn't great, all I have
at the moment are their footprints" — **customers do not have this information about their
own equipment.** Whoever holds it holds the relationship.

#### How photos get captured

| Path | Status | Approach |
|---|---|---|
| Inbound customer photos | Already arriving, unorganized | The morning routine already reads the mail. Extend it: when a thread is about equipment and carries image attachments, file them to the company's Drive folder and log them. |
| Crew photos on site | **The real gap** | Needs a deliberate capture path — either Actsoft's field app if it stores job photos, or a dedicated drop address / shared Drive folder crew send to from the truck. |
| Site visit photos | Ad hoc, on phones | Phone auto-upload into a shared Drive folder, sorted afterward by company and date. |
| Historical Actsoft photos | Unknown, potentially large | Ask Actsoft directly — see below. |

**Add this to the Actsoft conversation.** When requesting the CSV export, also ask: does the
field app capture photos against work orders, and can those be exported or reached by API? If
crews have been photographing jobs in Actsoft for years, that is a historical image library
worth more than the order data itself — and it would arrive already tied to a work order,
a date, and a customer.

**Known access limitation:** the Gmail connection available to these agents exposes attachment
*metadata* but not attachment *contents*. So photo capture cannot be fully automated from
Gmail alone as things stand. Two workable routes: a Gmail filter or Apps Script that
auto-saves qualifying attachments to Drive (after which agents can read them), or pulling
from Actsoft if the photos are already there. Confirm which before building the pipeline.

### Signal
The intelligence layer — anything that predicts a future job.

| Field | Notes |
|---|---|
| `company_id` | |
| `date` | |
| `type` | `expansion`, `relocation_study`, `equipment_aging`, `selling_assets`, `new_machine_incoming`, `leadership_change`, `capacity_change` |
| `source` | work order, email thread, site visit, conversation |
| `evidence` | the actual quote — never paraphrase away the original words |
| `predicted_window` | when the job likely lands |

## What the model lets you ask

These are the questions that turn a numbers game into a timing game:

- Who bought a machine 8–12 years ago and is due to replace it?
- Which accounts have we been to 3+ times but never sold equipment to?
- Who is selling assets right now that another account is shopping for?
- Which companies moved into a bigger space and will outgrow it again?
- Whose maintenance history shows a machine failing repeatedly — a replacement waiting to happen?
- Which contacts have we not talked to in 18 months at accounts that spent real money?
- When a fab shop buys a press brake, what do they buy 18 months later? (Learned from the data, not guessed.)

## Sources, ranked by value

| Source | Format | Status |
|---|---|---|
| Actsoft `OrderDetailsReport` historical export | 99 MB PDF | **Request as CSV instead — see below** |
| Actsoft `Rigging_invoices.csv` daily email | CSV | Already arriving every morning |
| Actsoft maintenance `OrderDetailsReport` | 15.6 MB PDF | Same CSV request applies |
| Molly's "Quote Needed" team emails | Email text | Already arriving, highly structured |
| Quote reply threads | Email text | Contains the price decision and the reasoning |
| Site visit notes / Granola transcripts | Text | Richest signal source, least captured |

### The single highest-leverage action

**Ask Actsoft to export order details as CSV rather than PDF.**

A 99 MB PDF is an image of a table. Getting clean data out of it means OCR, page-by-page
parsing, and hand-fixing errors — weeks of work with permanent accuracy problems. Actsoft
clearly can produce CSV, because the daily rigging invoice report already arrives that
way. The same export as CSV turns the hardest part of this project into an afternoon.

Do that before anything else gets built.

## Storage

Start with **SQLite** — one file, committed to this repo.

Not Postgres, not BigQuery, not Airtable, not a CRM. Reasons: a decade of work orders is
tens of megabytes, not terabytes; one file is portable and free; SQL answers every
question above directly; and version control means a bad parse can be rolled back rather
than silently corrupting the record. Graduate to a hosted database when the file becomes
genuinely painful — which may be never.
