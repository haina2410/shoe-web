# Komodo Redeploy Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger one authenticated Komodo redeploy after all production images publish successfully from `main`.

**Architecture:** A post-matrix GitHub Actions job signs the original push event payload with the shared Komodo webhook secret and sends those exact bytes to the Stack deploy listener. Job dependencies and event filters prevent partial, duplicate, pull-request, tag, or manual redeploys.

**Tech Stack:** GitHub Actions, Bash, OpenSSL, curl, Ruby YAML validation.

## Global Constraints

- Modify only the image-publishing workflow for runtime behavior.
- Add no code comments.
- Read secrets only through GitHub Actions environment variables.
- Send the exact bytes used to calculate the HMAC signature.
- Fail the job when Komodo returns a non-successful HTTP response.

---

### Task 1: Add the authenticated post-publish webhook

**Files:**
- Modify: `.github/workflows/publish-images.yml`

**Interfaces:**
- Consumes: `vars.KOMODO_WEBHOOK_URL`, `secrets.KOMODO_WEBHOOK_SECRET`, `GITHUB_EVENT_PATH`, `GITHUB_EVENT_NAME`, `GITHUB_RUN_ID`, and `GITHUB_RUN_ATTEMPT`.
- Produces: one GitHub-style authenticated HTTP POST to the configured Komodo listener after the complete `publish` matrix succeeds.

- [ ] **Step 1: Run a structural assertion and confirm RED**

Run:

```bash
ruby -e 'require "yaml"; workflow = YAML.load_file(".github/workflows/publish-images.yml", aliases: true); deploy = workflow.fetch("jobs").fetch("deploy"); abort unless deploy.fetch("needs") == "publish"'
```

Expected: FAIL because the `deploy` job does not exist.

- [ ] **Step 2: Add the minimal deploy job**

Add a `deploy` job that depends on `publish`, filters to `push` on
`refs/heads/main`, signs `GITHUB_EVENT_PATH` with HMAC-SHA256, and posts those
bytes to `KOMODO_WEBHOOK_URL` with GitHub-style headers.

- [ ] **Step 3: Validate structure and HMAC construction**

Run:

```bash
ruby -e 'require "yaml"; workflow = YAML.load_file(".github/workflows/publish-images.yml", aliases: true); deploy = workflow.fetch("jobs").fetch("deploy"); abort unless deploy.fetch("needs") == "publish"; abort unless deploy.fetch("if").include?("refs/heads/main")'
```

Expected: PASS.

Run a temporary-payload OpenSSL comparison against Ruby's HMAC implementation.
Expected: both digests are identical.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git diff -- .github/workflows/publish-images.yml
```

Expected: no whitespace errors and only the approved workflow job is added.
