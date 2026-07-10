# DNS / SSL Checklist

| Host | Target |
| --- | --- |
| `hawkaii.in` | Vercel frontend production |
| `api.hawkaii.in` | Render production API custom domain |
| `qa.hawkaii.in` | Vercel QA frontend |
| `qa-api.hawkaii.in` | Render QA API custom domain |
| `dev.hawkaii.in` | Vercel hosted dev frontend |
| `dev-api.hawkaii.in` | Render hosted dev API custom domain |

## Checks

- DNS resolves for every host.
- HTTPS certificate is valid for every host.
- HTTP redirects to HTTPS if configured.
- Frontend pages load without mixed content warnings.
- API health endpoint returns `200` on the matching API domain.
- CORS allows only the matching frontend for each API environment.
- Login cookie is secure and does not cross environments.

## CORS Pairs

| Frontend | API |
| --- | --- |
| `https://hawkaii.in` | `https://api.hawkaii.in` |
| `https://qa.hawkaii.in` | `https://qa-api.hawkaii.in` |
| `https://dev.hawkaii.in` | `https://dev-api.hawkaii.in` |
