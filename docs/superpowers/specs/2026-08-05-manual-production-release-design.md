# Manual production image promotion

Date: 2026-08-05  
Status: approved by the user

## Goal

Provide a manually triggered GitHub Actions workflow that releases an existing
set of GHCR images to production without rebuilding them.

## Source tag

The workflow has one required `workflow_dispatch` input named `tag` whose
default is `latest`.

- `latest` selects the images produced by the most recent successful `main`
  publishing workflow.
- A specific value must be the exact 12-character lowercase hexadecimal commit
  tag produced by `.github/workflows/publish-images.yml`.
- GitHub Releases and semantic version tags are not involved.

## Promotion

The workflow authenticates to GHCR and verifies that the selected source tag
exists for `app`, `worker`, `migrate`, `smoke`, and `dashboard`. Verification of
all five images completes before any destination tag changes.

After verification, each existing source manifest is copied to the mutable
`production` tag with `docker buildx imagetools create`. No Dockerfile is built
and the source manifests remain unchanged.

## Deployment

After all promotions succeed, the workflow sends a GitHub-style authenticated
webhook to Komodo. The signed JSON body has `ref` set to `refs/heads/main`, so a
Komodo Action or Procedure listening on `main` accepts it. The Action or
Procedure must run `npm run deploy:production` with `RELEASE_TAG=production`.
That script pulls the mutable tag with `--policy always`, runs migrations,
replaces the app and worker, checks health, and runs the read-only smoke test.

The workflow uses the GitHub `production` Environment. It reads
`vars.KOMODO_WEBHOOK_URL` and `secrets.KOMODO_WEBHOOK_SECRET` from that
environment. Production Environment protection rules can require approval
before promotion begins.

## Concurrency and failure behavior

Only one production release runs at a time and in-progress releases are never
canceled. Invalid inputs, a missing source image, registry promotion failure,
or a non-successful Komodo response fails the workflow. Komodo is not called
until every image has been promoted.

## Verification

Validate the workflow YAML and shell syntax, assert its input/default,
permissions, environment, target set, verification-before-promotion ordering,
manifest-only promotion, and authenticated Komodo request. Independently
compare the OpenSSL HMAC construction with another implementation.
