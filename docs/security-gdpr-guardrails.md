# Security and GDPR guardrails

This document records the current production guardrails for the post-submit flow, WhatsApp verification, and client area.

## Client codes and tokens

- `public_code` is customer-facing and safe to show. It is not sufficient to access private data.
- `verification_code` is generated only by the backend and stored only as `verification_code_hash`.
- `secure_token` is generated only by the backend and stored only as `secure_token_hash`.
- Client area access is denied when `client_area_enabled` is false or `secure_token_revoked_at` is set.
- Operators can revoke client area access through `POST /api/applications/{application_id}/client-area/revoke-token`.

## Verification abuse limits

- Verification codes expire after 24 hours.
- Resend is limited to one request per 60 seconds and five requests per day.
- WhatsApp verification attempts are limited by total attempt count and by a short rolling window.
- Failed, expired, rate-limited, and successful activation events are logged in `applications/{id}/security_events`.

## Webhook validation

- Incoming Meta webhooks are validated with `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is configured.
- Invalid webhook signatures are rejected with HTTP 403 and logged in the top-level `security_events` collection.
- Public API errors must stay generic and must not reveal whether a phone, token, or private lead exists.

## Consent capture

- `consent_version` and `consent_accepted_at` are stored on the application at submit time.
- `source_page`, `utm_source`, `utm_medium`, and `utm_campaign` are stored together with the application.
- A security audit event records whether consent metadata was captured.

## GCS signed URL migration strategy

Current compatibility mode still stores public GCS URLs in `uploaded_files` and proposal fields because CRM, extraction, PDF preview, and WhatsApp proposal sending already depend on this shape.

Target model:

1. Store canonical private paths separately, for example `uploaded_file_paths`, `proposal_file_path`, and `simulation_file_path`.
2. Keep public URL fields as read-only legacy compatibility fields during migration.
3. Return short-lived signed URLs only from authenticated CRM endpoints and secure client-area endpoints.
4. For client area responses, generate signed URLs with a short expiry and do not persist the signed URL in Firestore.
5. For WhatsApp document sending, generate a temporary signed URL immediately before calling Meta.
6. After all consumers use signed URLs, remove public ACL grants from new uploads, then migrate old objects to private ACL.

Acceptance rule for future work: no new client-facing file feature should rely on a permanent public GCS URL.
