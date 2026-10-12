# Cloud sync readiness

**Status: not active; backend setup is blocked on a reachable API and authentication configuration.** The app remains local-first, and enabling a feature flag alone would not provide safe, working cross-device sync.

## What is present in the repository

- Local SQLite task storage and a persistent `sync_queue` table.
- A queue helper and a polling sync-service skeleton.
- An authentication client that expects `/auth/signup`, `/auth/signin`, `/auth/refresh`, and `/auth/signout` endpoints, and stores returned tokens in Android SecureStore.
- Environment placeholders for `API_URL` and Cognito settings.

## What is not connected or deployable yet

- There is no backend/API source directory in this repository and no deployed API implementation was found.
- The app has no sign-up/sign-in screen or call sites for the auth client.
- Task-store changes do not enqueue records; the sync worker has no app-start/settings call site.
- The current worker posts to `/sync` without a Bearer token, reads `process.env.API_URL` instead of the resolved Expo runtime config, and does not implement a pull/reconciliation flow. **It must not be enabled or pointed at personal task data as-is.**
- No local `.env` file, real Cognito pool/client IDs, or deployed API configuration are present. The example host `https://api.beginora.app` did not resolve during this check; no user data was sent.

## Safe initial data scope

If sync is enabled later, keep it opt-in and limited to the user's tasks, first-step plans, status/due-date fields, and task outcomes. Do not sync conversations, imported documents, personal-context files, contacts, or local model files. Enforce per-user ownership at the API, use TLS, and follow the product architecture's client-side encryption requirement before uploading sensitive task content. Provide account-level export and deletion behavior before treating the feature as production-ready.

## Required setup to activate it

1. A reachable HTTPS API implementing the auth contract above and an authenticated, user-scoped `/sync` contract, with documented conflict and deletion behavior.
2. Real Cognito User Pool ID, app Client ID, and region (the repository's current auth plan), or an explicitly selected alternative identity provider.
3. A configured database for the API. The user mentioned either Neon or a Manus-managed database; no live database has been connected or chosen in this checkout.
4. After those prerequisites, wire task mutations to a retryable queue, send authenticated/encrypted payloads, implement reconciliation and user consent/status UI, then test two-account isolation and offline recovery.

EAS OTA updates and cloud task sync are independent: publishing app code does not sync user data, and a database alone cannot update an installed APK.
