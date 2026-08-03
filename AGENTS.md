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
