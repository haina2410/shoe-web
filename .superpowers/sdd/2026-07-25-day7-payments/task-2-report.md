# Task 2 report — SePay contract and HMAC validation

## Scope

Implemented the pure SePay webhook contract module and documented the required
webhook HMAC secret placeholder. The implementation has no logging and never
emits webhook bodies, signatures, or secrets.

## RED evidence

1. Added `src/lib/sepay.test.ts` before `src/lib/sepay.ts`.
2. Ran `npx vitest run src/lib/sepay.test.ts` while the module was absent.
3. Vitest failed during import analysis with `Failed to resolve import
   "@/lib/sepay"`; this is the expected failure caused by the missing module.

## GREEN evidence

After the minimal implementation:

- `npx vitest run src/lib/sepay.test.ts` — 1 test file passed; 13 tests passed.
- `npm run lint -- src/lib/sepay.ts src/lib/sepay.test.ts` — exited successfully
  with no lint output.
- `npx tsc --noEmit` — exited successfully.
- `git diff --check` — exited successfully.

The tests construct HMACs independently with Node crypto and cover exact raw
body authentication, a changed body, malformed signature rejection, the
inclusive ±300 second timestamp window, rejection at ±301 seconds, absent
caller secret rejection, the required payload validation, order-code
normalization, and Vietnam-local transaction time mapping.

## Changed files

- `src/lib/sepay.ts`: Zod webhook payload schema and inferred type; pure HMAC
  verification with strict hex decoding and constant-time comparison; order
  code normalization; Vietnam (+07:00) timestamp conversion.
- `src/lib/sepay.test.ts`: contract and security boundary tests.
- `.env.example`: documented `SEPAY_WEBHOOK_SECRET` placeholder only.

## Self-review

- The payload's official `id` remains the parsed identifier; no alternate
  idempotency key is introduced.
- `transferType` is restricted to inbound transactions and `transferAmount` to
  positive integer values.
- Signature comparison checks exact digest length before `timingSafeEqual`, so
  malformed input returns `false` rather than throwing.
- Signed content is exactly `${timestamp}.${rawBody}`; raw JSON is not parsed
  or reformatted before authentication.
- Transaction dates without an offset are explicitly mapped to Vietnam local
  time (+07:00).
- No payload, signature, or secret is logged or recorded in this report.
