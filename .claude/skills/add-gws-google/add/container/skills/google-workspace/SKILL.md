# Google Workspace

Google Workspace access is available through the `google_workspace` MCP server
backed by the host `gws` CLI.

Use it for:
- Gmail inbox and thread search
- Google Calendar event lookup and scheduling context
- Amazon purchase questions answered from Gmail receipts and shipping emails

Rules:
- Treat Gmail and Calendar access as read-only unless the user explicitly asks
  for a write action.
- If the `google_workspace` MCP server is unavailable or unauthenticated, say
  so directly and stop rather than guessing.
- For Amazon questions, search Gmail first. Common senders include
  `auto-confirm@amazon.com`, `shipment-tracking@amazon.com`,
  `digital-no-reply@amazon.com`, and `store-news@amazon.com`.
- When answering date-sensitive email or calendar questions, include explicit
  calendar dates.

Workflow:
- Use Gmail search/list/read tools from the `google_workspace` server for email
  questions.
- Use Calendar list/search tools from the `google_workspace` server for meeting
  and schedule questions.
- Summarize what you found concisely and cite the relevant senders, subjects,
  or event titles.
