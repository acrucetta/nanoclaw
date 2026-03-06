# Google Gog Workflows

Use this skill when the user asks about Gmail, Google Calendar, Amazon purchases from email, delivery updates, returns, refunds, or meeting schedules.

Available tools:
- `mcp__gog__gmail_search`
- `mcp__gog__calendar_events`
- `mcp__gog__calendar_search`
- `mcp__gog__auth_status`

Rules:
- Treat Gmail and Calendar as read-only unless the user explicitly asks to send or create something.
- Prefer compact summaries over raw email dumps.
- For Amazon questions, search Gmail instead of guessing.
- If `mcp__gog__auth_status` fails, say Google access is not authenticated and stop.

Useful Gmail queries:
- Recent Amazon purchases:
  `from:(auto-confirm@amazon.com shipment-tracking@amazon.com) newer_than:30d`
- Delivery updates:
  `from:(shipment-tracking@amazon.com) newer_than:14d`
- Returns and refunds:
  `from:amazon.com (return OR refund) newer_than:60d`
- Specific item:
  `from:amazon.com "air fryer"`
- Recent inbox:
  `in:inbox newer_than:7d`

Useful Calendar patterns:
- Next 7 days:
  use `mcp__gog__calendar_events` with `days=7`
- Today:
  use `mcp__gog__calendar_events` with `today=true`
- Search by keyword:
  use `mcp__gog__calendar_search`

When answering:
- Include dates, item names, statuses, and source context.
- Avoid quoting full email bodies unless the user asks.
