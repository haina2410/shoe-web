<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

### Comments

**Default to ZERO comments.** New or changed code should usually ship comment-free — clear names and short methods carry the explanation. A comment is an exception you justify, not a default you add.

- **No comment that paraphrases the code** — not the method name restated ("sums available items", "renders the order"), not the next line in English, not section banners.
- **The only reason to add one**: behaviour genuinely surprising enough to trip the next reader — a unit/currency conversion, a re-query gotcha, a text-vs-boolean compare, a cache bust, a partner-specific quirk, a deliberate deviation from convention.
- **Hard cap: 2 lines.** Longer only when the point is critical enough to warrant explicit acknowledgement — and then consider `.memory-bank/` or an ADR instead.
- **Prefer extraction over explanation** — if a block needs a comment to be readable, pull it into a well-named private method.
- **Watch the usual offenders** — migrations, rake tasks, service objects and serializers attract the most needless commentary.
- **Never leave authoring scaffolding** — "changed to fix X", "added per review", or notes about the edit itself belong in the commit message or PR description, not in the code.
- **Comments that stay**: `rubocop:disable` reasons, `# TODO`/`# NOTE` tied to a ticket.

## Commit messages

**Default to ONE line.** A subject and nothing else: `Make the settings sweep safe to run twice`. Imperative mood, ≤72 characters, ticket in front. A body is an exception you justify, not a default you add — the PR description is where the full story belongs.

- **Say what changed and why, not how** — the diff already shows how.
- **Never retell the diff** — no bullet list of touched files, methods or classes, no "renamed X, extracted Y, added spec for Z".
- **Never narrate the process** — "addressed review comments", "fixed rubocop", "after refactor" say nothing a reader needs six months later.
- **The only reason to add a body**: a decision the subject can't carry — a non-obvious failure mode being fixed, a rejected alternative, a constraint that forced an odd shape. Keep it to 1–3 sentences of prose.
- **One concern per commit** — if the subject needs an "and", it is probably two commits.

### Documentation

`docs/` contains durable references to the current system, not implementation
plans, dated progress reports, or change history. When behavior changes, update
the matching document in the same change:

- `01-overview-architecture.md`: runtime topology, components, module boundaries.
- `02-tech-stack.md`: dependencies, platform choices, technical constraints.
- `03-data-model.md`: Prisma entities, relationships, persistence invariants.
- `04-payment-checkout-flow.md`: checkout, VietQR, SePay, jobs, email, payment states.
- `05-design-direction.md`: storefront structure, visual rules, accessibility.
- `06-admin-order-domain.md`: order transitions, RBAC, reconciliation, refunds.
- `07-post-day10-storefront-backlog.md`: intentionally deferred product scope.
- `08-production-runbook.md`: environment, deployment, CI/CD, backup, rollback, incidents.

Update `docs/README.md` whenever a durable document is added, removed, renamed,
or changes responsibility. Documentation must describe current behavior and
invariants; do not add day-numbered logs, completed-task checklists, authoring
notes, or duplicated implementation detail. `docs/plans/` and
`docs/superpowers/` are ignored and must not be committed. Verify local Markdown
links after changing documentation.
