# Release-triggered production deployment

Date: 2026-08-05  
Status: approved by the user

## Goal

Notify the production Komodo flow when a non-prerelease GitHub Release is
published without building or promoting container images.

## Image tags

Every push to `main` publishes all GHCR images with the full 40-character commit
SHA and `latest`. Tag pushes do not rebuild images. A GitHub Release tag can be
the full commit SHA of an already-published image set.

## Deployment

The production workflow sends a GitHub-authenticated push-shaped webhook to
`vars.KOMODO_PRODUCTION_WEBHOOK_URL`. Its JSON body contains `ref` set to
`refs/heads/main` and `release_tag` set to the GitHub Release tag. The request is
signed with `secrets.KOMODO_WEBHOOK_SECRET`.

The Komodo flow applies `release_tag` to the production Stack's `RELEASE_TAG`
before running `npm run deploy:production`. Komodo's webhook listener does not
automatically map JSON fields to Stack environment variables. If the flow does
not apply the field, Compose falls back to `latest`.

## Staging

After the image matrix succeeds for a push to `main`, the publishing workflow
sends the original signed push payload to
`vars.KOMODO_STAGING_WEBHOOK_URL`. Staging and production have different URLs
and share the Komodo Core webhook signing secret.

## Failure behavior

Both workflows fail on non-successful Komodo responses. Production deployments
are serialized and are not canceled by newer releases. Drafts and prereleases
do not deploy.
