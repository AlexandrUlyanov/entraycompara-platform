# Sales Department Rollout Plan

## Scope

This rollout covers the CRM Sales Department module: Next Best Action UI, sales molecule state, audit trail, follow-up controls, guardrails, and autopilot control.

Related operational documents:

- `docs/whatsapp-cloud-api.md` for WhatsApp Cloud API, webhook, and Connection Health.
- `apps/admin-panel/README.md` for the CRM Settings screen.
- `apps/backend-upload-service/README.md` for Sales Department and WhatsApp endpoints.

## Default Mode

- Keep every lead in `manual` mode by default.
- AI can analyze context, create a draft message, prepare an action, and schedule follow-up metadata.
- The operator must approve or send any client-facing communication manually.
- `full_auto` remains blocked until explicit production guardrails are approved.

## Kill Switch

Set this environment variable on the backend Cloud Run service to stop event-driven Sales Department automation:

```text
SALES_DEPARTMENT_AUTOMATION_ENABLED=false
```

Effect:

- Event-driven Sales Department reanalysis is skipped.
- Autopilot modes are forced to disabled.
- UI receives `sales_automation_disabled` in blocked reasons.
- Manual CRM reads and explicit operator actions remain available.

Rollback:

- Set `SALES_DEPARTMENT_AUTOMATION_ENABLED=true` or remove the variable.
- Redeploy the backend service or update the Cloud Run revision.
- Recalculate Sales Department state from the CRM when needed.

## Staging Verification

1. Open a lead in CRM.
2. Confirm the simplified Next Best Action card is the primary Sales Department surface.
3. Confirm diagnostics, molecule/audit, automation, and follow-up details are behind collapsible sections.
4. Confirm no raw internal codes are visible in RU or ES UI.
5. Click refresh analysis and verify audit trail gets a new entry.
6. In manual mode, confirm `safe_to_send` remains false.
7. In assisted mode, confirm the system prepares but does not send without approval.
8. Create or reschedule a follow-up and confirm the timeline/audit entry is localized.
9. Open CRM Settings -> WhatsApp Connection and confirm Connection Health loads before testing WhatsApp-dependent flows.

## Production Rollout

1. Merge to `main` and wait for staging deploy.
2. Verify staging HTTP 200 for CRM, landing, and backend docs.
3. Test at least one real lead in manual mode.
4. Keep `SALES_DEPARTMENT_AUTOMATION_ENABLED=true` only if staging is healthy.
5. Run production workflow manually only after explicit operator approval.
6. Watch CRM audit trail and Cloud Run logs for the first production leads.

## Rollback Plan

1. Disable automation with `SALES_DEPARTMENT_AUTOMATION_ENABLED=false`.
2. If UI is affected, roll back Cloud Run admin service to the previous healthy revision.
3. If backend is affected, roll back backend Cloud Run to the previous healthy revision.
4. Recalculate affected leads manually after the issue is fixed.

## Test Command

```bash
python -m unittest discover -s apps/backend-upload-service/tests
```

Документ актуален на: 30 апреля 2026.
