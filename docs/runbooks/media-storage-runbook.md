# Media Storage Runbook

Last verified from the repository: 2026-06-30.

This runbook covers document, profile photo, company logo, and generated export storage.

## Architecture Summary

- Clients upload files to the backend.
- Backend validates limits and MIME types.
- Backend compresses images client-side before upload where frontend helpers are used.
- Backend can compress PDFs server-side through Ghostscript.
- Backend stores content through Cloudinary-compatible object storage.
- Backend writes metadata/version/access records in PostgreSQL.
- Clients download through backend-issued URLs.

## Important Env Keys

Backend:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER`
- `CLOUDINARY_RESOURCE_TYPE`
- `CLOUDINARY_UPLOAD_TRANSFORMATION`
- `CLOUDINARY_MOCK_UPLOADS`
- `MEDIA_UPLOAD_MAX_BYTES`
- `PDF_COMPRESSION_ENABLED`
- `PDF_COMPRESSION_BINARY`
- `PDF_COMPRESSION_FAIL_OPEN`

Production and hosted QA must use `CLOUDINARY_MOCK_UPLOADS=false`.

## Upload Smoke

Non-production smoke:

1. Log in.
2. Upload one small image/document through EMS, expenses, profile photo, or company logo flow.
3. Confirm success response.
4. Confirm document metadata is visible.
5. Request download URL through backend.
6. Open/download file.
7. Confirm no Cloudinary secret is exposed in frontend code or network responses.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Upload rejected | file size, MIME type, module-specific policy. |
| Upload succeeds but download fails | document metadata, object storage key, Cloudinary folder/env. |
| PDF upload slow/fails | Ghostscript availability, compression timeout, fail-open setting. |
| Works locally but not hosted | `CLOUDINARY_MOCK_UPLOADS`, hosted credentials, folder permissions. |
| Profile photo/logo not visible | document ID linkage in core/company profile, cached frontend state. |

## Safety Rules

- Never expose `CLOUDINARY_API_SECRET` to frontend.
- Do not bulk-delete Cloudinary folders without environment and release-owner confirmation.
- Keep dev/QA/prod folders or product environments isolated.
- Do not point QA cleanup scripts at production folders.

