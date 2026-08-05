# Release-triggered Production Deployment Plan

**Goal:** Split staging and production Komodo webhooks and deploy production
when a non-prerelease GitHub Release is published.

**Architecture:** Main pushes build full-SHA and `latest` images before calling
the staging flow. Published Releases call the production flow with the Release
tag in a signed payload. Komodo applies that value to `RELEASE_TAG`, with
Compose falling back to `latest`.

## Tasks

- [x] Publish only full commit SHA and `latest` image tags from `main`.
- [x] Use `KOMODO_STAGING_WEBHOOK_URL` after the complete image matrix.
- [x] Replace manual registry promotion with a `release.published` workflow.
- [x] Send the Release tag to `KOMODO_PRODUCTION_WEBHOOK_URL`.
- [x] Use `KOMODO_WEBHOOK_SECRET` for GitHub-style HMAC authentication.
- [x] Change the deploy script's inferred tag to the full commit SHA.
- [x] Document Komodo's responsibility for applying `release_tag`.
- [x] Validate YAML, shell syntax, HMAC construction, and repository tests.
