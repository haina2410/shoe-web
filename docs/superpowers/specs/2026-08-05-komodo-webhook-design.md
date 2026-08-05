# Komodo redeploy webhook after image publishing

Date: 2026-08-05  
Status: approved by the user

## Goal

Trigger one Komodo Stack redeploy after every image in the GitHub Actions
publishing matrix succeeds for a push to `main`.

## Design

Add a separate `deploy` job to `.github/workflows/publish-images.yml`. The job
depends on the complete `publish` matrix through `needs: publish`, runs only for
the `push` event on `refs/heads/main`, and requires no repository checkout.

The job reads the original GitHub webhook payload from `GITHUB_EVENT_PATH`,
computes its HMAC-SHA256 with `KOMODO_WEBHOOK_SECRET`, and sends the same bytes
to `KOMODO_WEBHOOK_URL`. The request uses `application/json`, identifies itself
as a GitHub push event, includes a delivery identifier derived from the workflow
run, and supplies the signature as `X-Hub-Signature-256: sha256=<digest>`.

## Configuration

- `vars.KOMODO_WEBHOOK_URL` contains the Komodo GitHub-style Stack deploy URL.
- `secrets.KOMODO_WEBHOOK_SECRET` matches Komodo Core's
  `KOMODO_WEBHOOK_SECRET` exactly.
- The URL must be reachable from the selected GitHub-hosted runner.

## Failure behavior

The deploy job is skipped for pull requests, tags, manual dispatches, and failed
image publishing. `curl --fail-with-body` makes non-successful Komodo responses
fail the job while preserving the response body in the Actions log.

## Verification

Validate the workflow as YAML, assert the job dependency and event filters,
and verify that signing and sending the same payload bytes produces the expected
HMAC-SHA256 digest.
