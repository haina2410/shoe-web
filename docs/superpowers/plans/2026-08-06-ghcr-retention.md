# GHCR Retention Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scheduled cleanup for all five GHCR image packages while retaining their 20 newest versions.

**Architecture:** A dedicated GitHub Actions workflow uses a five-target matrix and the official `actions/delete-package-versions@v5` action. It runs weekly or manually with package write permission and uses the repository token.

**Tech Stack:** GitHub Actions, actions/delete-package-versions, Ruby YAML validation.

## Global Constraints

- Keep the newest 20 versions of each package.
- Clean `app`, `worker`, `migrate`, `smoke`, and `dashboard`.
- Run Monday at 03:00 Asia/Ho_Chi_Minh and by manual dispatch.
- Use `GITHUB_TOKEN`; add no new secret.
- Add no code comments.
- Preserve unrelated working-tree changes.

---

### Task 1: Scheduled package cleanup

**Files:**
- Create: `.github/workflows/cleanup-images.yml`
- Modify: `docs/08-production-runbook.md`

**Interfaces:**
- Consumes: `github.event.repository.name`, `matrix.target`, and `secrets.GITHUB_TOKEN`.
- Produces: one cleanup attempt for each GHCR package, retaining 20 versions.

- [x] **Step 1: Run a failing structural assertion**

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cleanup-images.yml", aliases: true)'
```

Expected: fail with `No such file or directory`.

- [x] **Step 2: Add the workflow**

Create `cleanup-images.yml` with cron `0 20 * * 0`, `workflow_dispatch`, a
non-canceling concurrency group, `contents: read`, `packages: write`, a
five-target matrix, and `actions/delete-package-versions@v5` configured with
`package-type: container`, `min-versions-to-keep: 20`, and `GITHUB_TOKEN`.

- [x] **Step 3: Document retention**

Add the schedule, package access requirement, retained count, and old rollback
image consequence to the production runbook.

- [x] **Step 4: Run GREEN structural checks**

```bash
ruby - <<'RUBY'
require "yaml"
workflow = YAML.load_file(".github/workflows/cleanup-images.yml", aliases: true)
triggers = workflow.fetch(true)
raise unless triggers.fetch("schedule") == [{"cron" => "0 20 * * 0"}]
raise unless triggers.key?("workflow_dispatch")
job = workflow.fetch("jobs").fetch("cleanup")
raise unless job.fetch("permissions") == {"contents" => "read", "packages" => "write"}
raise unless job.dig("strategy", "matrix", "target") == %w[app worker migrate smoke dashboard]
step = job.fetch("steps").first
raise unless step.fetch("uses") == "actions/delete-package-versions@v5"
raise unless step.fetch("with").fetch("package-type") == "container"
raise unless step.fetch("with").fetch("min-versions-to-keep") == 20
RUBY
git diff --check
```

Expected: all assertions pass and no whitespace errors are reported.

- [x] **Step 5: Run repository verification**

Run `npm test -- --run`. Record any unrelated failure without modifying
application code.

- [x] **Step 6: Commit**

Stage only the workflow, runbook, and completed plan, then commit with
`ci: clean old GHCR images`.
