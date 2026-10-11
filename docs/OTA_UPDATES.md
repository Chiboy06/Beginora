# Beginora over-the-air updates

The Settings screen’s **Check for updates** action uses Expo EAS Update for compatible JavaScript and bundled-asset changes. It is not a task-data backend: tasks, plans, and outcomes remain in local SQLite, and no Neon database is needed for this path.

## One-time EAS setup

1. Create or link the Beginora project in an Expo account and obtain its EAS project ID.
2. Set `EAS_PROJECT_ID` in the local `.env` used for release builds. The ID is not a secret; `.env` itself must remain uncommitted.
3. In the GitHub repository, add the repository variable `EAS_PROJECT_ID` and repository variable `EAS_UPDATES_ENABLED=true`.
4. Add an Expo access token as the GitHub Actions secret `EXPO_TOKEN`. Do not commit or paste the token into source files.
5. Build/install a new preview APK with the linked EAS project ID. The binary embeds the update URL, app-version runtime, and `preview` channel.

After setup, pushes to `main`, `develop`, or `manus/beginora-android-mvp` publish compatible JavaScript/assets to the `preview` channel. Open **Settings → Check for updates** on the installed preview APK to fetch and apply them. The workflow is intentionally skipped until `EAS_UPDATES_ENABLED` is set.

## Important limits

- OTA can update JavaScript and bundled assets only. Changes to native modules, Android permissions, package identifiers, or native configuration require a new APK/AAB build.
- A different signing key still requires uninstalling the old test build before installing the new one.
- A release build must use the same EAS project and channel as the published update.
- The update service is not linked yet in this workspace: no EAS project ID or Expo token is configured. The app remains usable offline while it is unlinked.
