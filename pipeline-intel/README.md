# pipeline-intel

Machine-tool pipeline × rigging work-order intelligence.

- **`dashboard.html`** — self-contained interactive dashboard (open in any browser; no server,
  no dependencies). KPIs, pipeline health by rep, tiered action lists, rigging-intel lead cards,
  cross-market matches, per-rep marching orders, and a filterable drill-down of all 137 opps.
- **`STRATEGIC-ROADMAP.md`** — printable meeting doc with the same tiers and plays.
- **`data/pipeline_by_rep_stage_2026-08-03.csv`** — the Salesforce "Pipeline by Rep & Stage"
  export the dashboard was built from.

## Rebuilding with fresh data

The dashboard embeds the pipeline rows as a JSON array (`const DATA = [...]` near the top of the
script block). To refresh: export the same Salesforce report as CSV, parse it to objects with keys
`account, opp, amount, prob, close, days_past_close, owner, stage, next_step`, and replace the
array. Status buckets (live / lapsed / dormant) and weighted values are computed at load time.

## Known data gaps

- The comprehensive historical work-order report export **failed** on the Salesforce side (file
  contained only an error message). Rigging cross-reference currently draws on the 8 accounts in
  `../intel/accounts-seed.json`. Re-export as CSV to unlock multi-year history.
- Ask Actsoft for `OrderDetailsReport` as CSV rather than PDF (see `../intel/DATA-MODEL.md`).
