# Post-submit and client area QA checklist

This checklist validates the MVP flow without creating unnecessary production-like data.

## Important staging warning

Staging backend uses the same Firestore, GCS bucket, email secrets, and WhatsApp configuration as the live environment. Do not run load tests, repeated form submissions, or fake WhatsApp campaigns against staging. Use one clearly named QA lead per test pass and delete or mark it after verification.

Recommended QA marker:

- Client name: `QA Post Submit <date>`
- Email: internal test inbox only
- Notes: `QA post-submit/client-area acceptance test`

## Backend helper checks

Run from the repository root:

```powershell
python -m unittest apps.backend-upload-service.tests.test_sales_department
```

The suite covers:

- verification code generation and display formatting;
- client secret hashing for verification codes and secure tokens;
- WhatsApp activation text parsing;
- verification attempt window behaviour;
- Meta webhook signature validation helper;
- existing sales-department guardrails.

## Manual E2E checklist

1. Submit a factura through the landing page using a small PDF/JPG/PNG and QA marker data.
2. Confirm the backend response contains `public_code`, `verification_code_display`, `verification_code_expires_at`, `whatsapp_url`, and no plaintext secure token.
3. Confirm the Firestore application has `verification_code_hash`, `secure_token_hash`, `client_visible_status`, `consent_version`, source/UTM fields, and no plaintext `verification_code` or `secure_token`.
4. Confirm the post-submit screen shows `Hemos recibido tu factura`, tracking code, WhatsApp activation code, timeline, and a WhatsApp CTA.
5. Open the WhatsApp URL and verify the prefilled text contains the backend phone number and the expected `EC-xxxxxx / xxxxxx` code.
6. Send the activation message from the client WhatsApp number.
7. Confirm the webhook sets `whatsapp_verified`, `client_area_enabled`, `client_area_url`, and creates security/timeline events.
8. Open `/area/c/{secure_token}` from the WhatsApp reply and confirm the client sees status, client data, files, extracted data if available, simulations if available, proposal if available, and WhatsApp CTA.
9. Open `/area/c/invalid-token` and confirm the response is generic and does not reveal any private lead data.
10. Send an incorrect activation code and confirm the client receives a generic validation error while the CRM/security events record the failed attempt.
11. Force or wait for an expired code and confirm the expired-code response is generic and the lead is not activated.
12. In CRM, search the lead by `public_code` and confirm status, WhatsApp verification, client area state, and timeline are visible.
13. Revoke the client area token from the management endpoint and confirm the old secure link no longer opens.
14. Generate or upload a proposal and confirm verified WhatsApp clients receive the client-area link while unverified clients are not auto-notified.

## Frontend smoke plan

Landing page:

- the upload/post-submit flow renders in Spanish;
- WhatsApp activation CTA uses backend-provided URL;
- mobile layout keeps tracking code, activation code, timeline, and reassurance text visible;
- the page does not promise completion in a few seconds.

Client area:

- valid token renders status summary, files, extracted data, simulations, proposal, events, and CTAs;
- invalid token renders a generic not-found state;
- proposal-ready and proposal-accepted states are visually clear;
- mobile layout is one-column and CTA buttons remain usable.

CRM:

- public code is visible in the lead card/detail view;
- WhatsApp verified/client-area badges match backend state;
- timeline shows activation, proposal notification, and security-relevant notes;
- old leads without `public_code`, `client_visible_status`, or client-area fields still render without crashing.

## Safe automated E2E plan

Do not automate public submit against shared staging by default. For CI, prefer a future isolated Firebase/GCS project or a mocked backend.

When an isolated test environment exists, automate:

- submit factura creates application and file metadata;
- webhook activation enables client area;
- invalid webhook payload is rejected;
- client area valid/invalid token flows;
- CRM search by public code.
