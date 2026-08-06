# GHCR retention cleanup

Date: 2026-08-06
Status: approved by the user

## Goal

Delete old GitHub Container Registry versions automatically while retaining the
20 newest versions of every application image.

## Workflow

A dedicated GitHub Actions workflow runs every Monday at 03:00 Asia/Ho_Chi_Minh
time, represented as Sunday 20:00 UTC in the cron expression. It also supports
manual dispatch.

One matrix job runs `actions/delete-package-versions@v5` for `app`, `worker`,
`migrate`, `smoke`, and `dashboard`. Each package name is the repository name
followed by the image target, such as `shoe-web/app`. The package type is
`container` and `min-versions-to-keep` is `20`.

## Authentication and failure behavior

The workflow grants `contents: read` and `packages: write`, then explicitly
passes `secrets.GITHUB_TOKEN` to the action. The repository must have Admin
access under each package's Manage Actions access setting. A failure for one
package does not cancel cleanup attempts for the other package targets.

## Retention consequence

The policy keeps versions only by recency. A commit or release image older than
the newest 20 package versions can be deleted and become unavailable for
rollback.

## Verification

Parse the workflow as YAML and assert the schedule, manual trigger, permissions,
five package targets, container type, official action version, token, and
retention count. Run repository tests and check the final diff for whitespace
errors.
