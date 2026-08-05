# Plain-SHA Webhook Payloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Komodo deployment webhooks sign and send only a full commit SHA as plain text.

**Architecture:** The staging job derives its payload from `GITHUB_SHA`; the production job derives it from the GitHub Release tag. Each job validates 40 lowercase hexadecimal characters, signs the exact bytes produced by `printf '%s'`, and sends those same bytes as `text/plain` without a newline.

**Tech Stack:** GitHub Actions, Bash, OpenSSL, curl, Ruby YAML validation.

## Global Constraints

- Both payloads contain exactly one 40-character lowercase commit SHA.
- Neither request body is JSON or contains a trailing newline.
- Retain separate staging and production webhook URLs.
- Retain GitHub-style HMAC and delivery headers.
- Add no code comments.
- Preserve unrelated working-tree changes.

---

### Task 1: Plain-SHA webhook requests

**Files:**
- Modify: `.github/workflows/publish-images.yml:98-126`
- Modify: `.github/workflows/release-production.yml:17-52`
- Modify: `docs/08-production-runbook.md:168-198`

**Interfaces:**
- Consumes: `GITHUB_SHA`, `github.event.release.tag_name`, `KOMODO_STAGING_WEBHOOK_URL`, `KOMODO_PRODUCTION_WEBHOOK_URL`, and `KOMODO_WEBHOOK_SECRET`.
- Produces: one signed 40-byte staging request body and one signed 40-byte production request body.

- [x] **Step 1: Run the failing structural assertion**

```bash
ruby - <<'RUBY'
publish = File.read('.github/workflows/publish-images.yml')
production = File.read('.github/workflows/release-production.yml')
raise unless publish.include?('payload="$GITHUB_SHA"')
raise unless production.include?('payload="$RELEASE_TAG"')
raise unless [publish, production].all? { |source| source.include?('Content-Type: text/plain') }
raise if production.include?('jq -cn')
RUBY
```

Expected: FAIL because staging still signs `GITHUB_EVENT_PATH` and production still constructs JSON with `jq`.

- [x] **Step 2: Implement the staging request**

Set `payload="$GITHUB_SHA"`, reject values outside `^[0-9a-f]{40}$`, calculate the signature from `printf '%s' "$payload"`, set `Content-Type: text/plain`, and send `--data-binary "$payload"`.

- [x] **Step 3: Implement the production request**

Set `payload="$RELEASE_TAG"`, reject values outside `^[0-9a-f]{40}$`, remove the `jq` JSON construction, calculate the signature from `printf '%s' "$payload"`, set `Content-Type: text/plain`, and send `--data-binary "$payload"`.

- [x] **Step 4: Align the runbook**

Document that both requests carry only the full SHA, production Release tags must be full lowercase SHAs, and the listener must accept a plain-text body rather than parse a GitHub push event.

- [x] **Step 5: Run workflow and HMAC verification**

Parse both workflows with Ruby YAML, rerun the structural assertion from Step 1, extract every `run` step and check it with `bash -n`, and compare OpenSSL HMAC output with Ruby `OpenSSL::HMAC` for a sample 40-byte SHA.

Expected: all assertions, shell syntax checks, byte-length checks, and digests pass.

- [x] **Step 6: Run repository verification**

```bash
npm test -- --run
git diff --check
```

Expected: 101 test files and 670 tests pass, and the diff has no whitespace errors.

- [x] **Step 7: Commit the implementation**

```bash
git add .github/workflows/publish-images.yml .github/workflows/release-production.yml docs/08-production-runbook.md
git commit -m "fix(ci): send plain SHA webhook payloads"
```
