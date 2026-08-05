# Plain-SHA Komodo webhook payloads

Date: 2026-08-06
Status: approved by the user

## Goal

Send only a full commit SHA as the body of both Komodo deployment webhooks so
the HMAC is calculated over the same simple byte sequence Komodo receives.

## Payloads

The staging deployment sends the exact 40-character lowercase `GITHUB_SHA` from
the completed `main` push build. The production deployment sends the exact
GitHub Release tag after validating that it is a 40-character lowercase commit
SHA.

Neither payload is JSON and neither payload includes a trailing newline. Both
requests use `Content-Type: text/plain`.

## Authentication

Each job stores its SHA in a `payload` shell variable. It calculates the
HMAC-SHA256 by piping `printf '%s' "$payload"` to OpenSSL, then sends the same
variable with `curl --data-binary "$payload"`. The request retains
`X-Hub-Signature-256`, `X-GitHub-Event`, and `X-GitHub-Delivery` headers.

The staging and production webhook URLs remain separate. Both requests use the
shared `KOMODO_WEBHOOK_SECRET` configured in Komodo Core.

## Failure behavior

Production stops before contacting Komodo when the Release tag is not a full
lowercase commit SHA. A non-successful Komodo response fails either deployment
job through `curl --fail-with-body`.

A Komodo listener that parses GitHub push JSON for branch filtering may reject
the plain-text body after authentication. These payloads require a Komodo flow
or Stack listener that accepts the SHA body without parsing a GitHub event.

## Verification

Parse both workflow files, assert their payload sources, content type, SHA
validation, and absence of JSON construction, then check every embedded shell
step with `bash -n`. Independently compare the OpenSSL HMAC with Ruby's OpenSSL
implementation over a sample full SHA and confirm the payload contains exactly
40 bytes.
