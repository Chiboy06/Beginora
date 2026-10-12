# Repository-to-app updates

Beginora can receive compatible JavaScript and bundled-asset updates through **Expo EAS Update**. GitHub does not directly replace an installed APK: a repository push must first be published to EAS by the GitHub Actions workflow, and the installed binary must be linked to the same EAS project, runtime, and channel.

When the app is online, a linked release build checks for a compatible update on startup/foreground/network reconnection, downloads it without interrupting the current screen, and asks the user whether to restart. The Settings screen also supports a manual check. **No restart or update install happens without the user's choice.** Core task data remains in local SQLite; this is app-code delivery, not cloud sync or a database backend.

## One-time setup

1. Create or link the Beginora project in an Expo account and obtain its EAS project ID.
2. Set `EAS_PROJECT_ID` and `EAS_UPDATES_ENABLED=true` in the local release build environment. The ID is not a secret; never commit `.env`.
3. In the GitHub repository, add repository variable `EAS_PROJECT_ID` and repository variable `EAS_UPDATES_ENABLED=true`.
4. Add an Expo access token as the GitHub Actions secret `EXPO_TOKEN`. Do not commit or paste the token into source files.
5. Build/install a fresh preview APK with this project ID. Existing binaries without the matching update URL/channel cannot receive these updates.

After setup, pushes to `main`, `develop`, or `manus/beginora-android-mvp` publish compatible JavaScript/assets to the `preview` channel. The workflow is intentionally skipped until `EAS_UPDATES_ENABLED` is set.

## Important limits and current state

- **This workspace is not linked yet:** there is no configured EAS project ID or Expo token. OTA metadata is now disabled unless both `EAS_UPDATES_ENABLED=true` and a real project ID are present at native build time. The app remains offline-usable, but automatic update delivery will stay unavailable until the setup above is completed and a matching APK is installed.
- OTA changes JavaScript and bundled assets only. Native-module changes, Android permissions, package identifiers, or native configuration require a new APK/AAB build.
- Applying a downloaded update restarts the app only after the user confirms; local task data remains on the device.
- A different signing key still requires uninstalling the old test build before installing the new one.
- Cloud task sync is separate and not active; the repository has disconnected client scaffolding but no reachable authenticated backend. See [Cloud sync readiness](CLOUD_SYNC_STATUS.md). A database is not needed for OTA.
