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
