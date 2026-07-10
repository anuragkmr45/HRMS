# Rollback Runbook

## Backend

1. Identify the failed environment: hosted dev, QA, or production.
2. Open the matching Render API service.
3. Roll back to the previous successful deploy from Render deploy history.
4. Roll back the matching worker service to the same commit/deploy where possible.
5. Run API health:

```bash
curl -i https://api.hawkaii.in/api/v1/health/ready
```

Use the QA/dev API URL for those environments.

## Database

Migrations should be treated as forward-only unless a migration explicitly documents a safe rollback. If a deployment includes a bad migration:

1. Stop further deploys.
2. Snapshot/backup the affected Neon branch.
3. Apply a forward corrective migration.
4. Restore only if the business accepts data loss risk and a verified backup exists.

## Frontend

Use Vercel deployment history to promote or roll back the affected frontend project to the previous successful deployment.

## Media / Cloudinary

Do not bulk-delete Cloudinary folders during rollback unless the release owner confirms the uploaded assets were created only by the failed release and are safe to remove.

## Signoff After Rollback

- API health passes.
- Frontend loads.
- Login/logout works.
- Document upload/download works in the target env.
- No cross-environment data is visible.
