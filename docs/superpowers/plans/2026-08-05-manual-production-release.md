# Manual Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual GitHub Actions workflow that promotes existing `latest` or 12-character commit-tagged GHCR images to `production` and triggers the production Komodo deployment.

**Architecture:** One `workflow_dispatch` job validates the source tag, verifies every source manifest, copies those manifests to the mutable `production` tag, and sends a signed push-shaped webhook to a production Komodo Action or Procedure. The production Komodo environment fixes `RELEASE_TAG=production`, so the existing deployment script force-pulls the promoted images and performs migration, health, and smoke checks.

**Tech Stack:** GitHub Actions, Bash, GHCR, Docker Buildx imagetools, OpenSSL, curl, Komodo.

## Global Constraints

- The manual input is named `tag`, is required, and defaults to `latest`.
- A non-`latest` input is exactly 12 lowercase hexadecimal characters.
- Promote existing registry manifests; never rebuild images in this workflow.
- Verify `app`, `worker`, `migrate`, `smoke`, and `dashboard` before changing any `production` tag.
- Use the GitHub `production` Environment and its `KOMODO_WEBHOOK_URL` variable and `KOMODO_WEBHOOK_SECRET` secret.
- Trigger a Komodo Action or Procedure that runs `npm run deploy:production` with `RELEASE_TAG=production`.
- Add no code comments.
- Preserve unrelated working-tree changes.

---

### Task 1: Manual production promotion workflow

**Files:**
- Create: `.github/workflows/release-production.yml`
- Modify: `.env.production.example`
- Modify: `docs/08-production-runbook.md`

**Interfaces:**
- Consumes: `inputs.tag`, `github.repository`, `github.actor`, `secrets.GITHUB_TOKEN`, `vars.KOMODO_WEBHOOK_URL`, and `secrets.KOMODO_WEBHOOK_SECRET`.
- Produces: GHCR `production` tags for all five image targets and one authenticated Komodo deployment request.

- [ ] **Step 1: Run the structural test and confirm RED**

Run:

```bash
ruby -e 'require "yaml"; workflow = YAML.load_file(".github/workflows/release-production.yml", aliases: true); abort unless workflow.fetch("jobs").fetch("release")'
```

Expected: FAIL because `.github/workflows/release-production.yml` does not exist.

- [ ] **Step 2: Add the workflow**

Create a manual workflow with a required `tag` input defaulting to `latest`, a
non-canceling production concurrency group, `contents: read` and
`packages: write`, the `production` Environment, separate verification and
promotion loops, and a final HMAC-authenticated Komodo request.

- [ ] **Step 3: Align production configuration documentation**

Set the production example and production Stack runbook value to
`RELEASE_TAG=production`. Set the staging example explicitly to
`RELEASE_TAG=latest`. Document that the Komodo URL must target an Action or
Procedure running `npm run deploy:production`, not a direct Stack deploy.

- [ ] **Step 4: Run GREEN workflow checks**

Parse the YAML and assert the input/default, production environment,
permissions, target list, tag validation, verification-before-promotion order,
manifest promotion command, and webhook variable/secret references. Extract
each shell step and run `bash -n`. Independently compare the OpenSSL digest with
Ruby `OpenSSL::HMAC` over the same payload.

Expected: every assertion and syntax/HMAC check passes.

- [ ] **Step 5: Run repository verification and review the diff**

Run:

```bash
npm test -- --run
git diff --check
git diff -- .github/workflows/release-production.yml .env.production.example docs/08-production-runbook.md
```

Expected: tests pass when the local test PostgreSQL service is available, no
whitespace errors, and the diff contains only the approved release workflow and
production/staging release-tag documentation.

- [ ] **Step 6: Commit the implementation**

```bash
git add .github/workflows/release-production.yml .env.production.example docs/08-production-runbook.md
git commit -m "ci: add manual production promotion"
```
