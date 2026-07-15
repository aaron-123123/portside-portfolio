# Agent guide

**The full project guide (architecture, commands, conventions, gotchas) is in
[`CLAUDE.md`](./CLAUDE.md).** Read it before editing.

<!-- BEGIN:nextjs-agent-rules -->
## This is Next.js 16 — not the Next.js you may know

APIs and conventions differ from older versions. Notably, `cookies()`,
`headers()`, and route `params` are **async** (await them). Read the relevant
guide in `node_modules/next/dist/docs/` before writing App-Router code, and heed
deprecation notices.
<!-- END:nextjs-agent-rules -->
