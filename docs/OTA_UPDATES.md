# Repository-to-app updates with EAS

Beginora can receive compatible JavaScript and bundled-asset updates through **Expo EAS Update**. A GitHub push does not directly change an installed APK: the workflow publishes the app bundle to EAS, and the installed build must already be linked to the same EAS project, runtime version, and channel.

This delivers app code only. Task data stays in local SQLite; EAS Update is not cloud sync. Native-module, permission, package-ID, or native configuration changes still require a new APK. The installed 0.2.4 APK has no EAS update URL, so it cannot be retrofitted to receive OTA updates.

## 1. Create or link the Expo project

From the Beginora repository root, sign in and run Expo's setup command:

```sh
npx eas-cli@latest login
npx eas-cli@latest update:configure
```

When prompted, create or select the Expo project for Beginora. The command writes the project ID to `app.json` under `expo.extra.eas.projectId`, and configures the EAS update URL and runtime version. The project ID is an identifier, **not a secret**. This repo's dynamic `app.config.ts` reads that ID and still requires the explicit OTA opt-in.

The `preview` EAS build profile is configured to use the `preview` environment and channel and to opt in to updates once the project is linked. Local Gradle builds remain OTA-disabled unless you explicitly opt in through environment variables.

## 2. Add the GitHub Actions configuration

Open [Beginora's Actions settings](https://github.com/Chiboy06/Beginora/settings/secrets/actions) and select **Settings → Secrets and variables → Actions**.

On the **Variables** tab, create these two repository variables:

| Name | Value |
|---|---|
| `EAS_PROJECT_ID` | The project UUID from `app.json` / Expo dashboard |
| `EAS_UPDATES_ENABLED` | `true` (lowercase) |

On the **Secrets** tab, create this repository secret:

| Name | Value |
|---|---|
| `EXPO_TOKEN` | An Expo access token created at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens) |

Treat `EXPO_TOKEN` like a password. Do not paste it in chat, commit it, or add it to `.env`. If your Expo account supports it, prefer a dedicated Robot user with only the access needed for this project. The workflow reads the project ID and opt-in from GitHub **variables**, and the token from the GitHub **secret**. GitHub's [variables guide](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables) and [secrets guide](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) describe these repository-level settings.

## 3. Build and install a linked preview APK

For a local build, set the following in the ignored `.env` file at the repository root. The file is already listed in `.gitignore`:

```dotenv
EAS_PROJECT_ID=<your-project-uuid>
EAS_UPDATES_ENABLED=true
EAS_UPDATE_CHANNEL=preview
```

Do **not** put `EXPO_TOKEN` in this file. Check the resolved config before building; it should show updates enabled, an update URL containing your project UUID, and the `preview` channel:

```sh
npx expo config --type public
```

Then create the Android native project and release APK:

```sh
npx expo prebuild --platform android --clean --no-install
cd android
./gradlew :app:assembleRelease
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. Building locally from the same workspace preserves Beginora's current test signing identity. An EAS cloud build may use a different signing key; Android will reject it as an in-place upgrade if its key differs, so do not uninstall the current app until the signing identity is confirmed.

For an EAS cloud build, run:

```sh
npx eas-cli@latest build --profile preview --platform android
```

The repo's `preview` profile now selects the EAS `preview` environment, APK distribution, and `preview` channel, with `EAS_UPDATES_ENABLED=true`. EAS Update environment variables are described in [Expo's EAS environment-variable guide](https://docs.expo.dev/eas/environment-variables/).

## 4. Publish the first preview update

Install and open a **linked preview APK** first. Then go to GitHub **Actions → Publish EAS Preview Update → Run workflow**, select `fix/eas-ota-explicit-opt-in` (or the branch you intend to publish), and run it. The workflow also runs on configured pushes to supported branches. A push made while the opt-in variable was unset was skipped; enabling the variable does not replay that earlier run.

The workflow publishes to the `preview` channel and specifies the `preview` EAS environment. Expo requires an environment for SDK 55 and later. Once published, use Beginora **Settings → Check for updates** on the linked app. A downloaded update is applied only after the user chooses to restart. See [Expo's EAS Update setup guide](https://docs.expo.dev/eas-update/getting-started/) for the EAS CLI details.

## Current status and boundaries

- No Beginora EAS project ID or Expo token has been supplied/configured in this workspace. Until the project is linked and a new APK is installed, the Settings update action correctly reports OTA as unavailable.
- Enabling the GitHub workflow does not enable it in already-installed APKs. Those binaries need a new linked build.
- OTA cannot add or repair native code, permissions, or native startup configuration. The current launch-loop investigation is separate; a native fix still needs a new APK.
- Cloud task sync remains disabled. Keep `ENABLE_CLOUD_SYNC=false`; OTA does not upload task data. See [cloud sync readiness](CLOUD_SYNC_STATUS.md).

## Official references

- [Expo — Get started with EAS Update](https://docs.expo.dev/eas-update/getting-started/)
- [Expo — EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
- [GitHub — Store information in variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
- [GitHub — Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
