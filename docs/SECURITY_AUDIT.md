# Dependency security audit status

**Checked:** 2026-10-11. This is a dependency/tooling audit, not a claim that the app has undergone a complete security review.

## Current result

`npm audit` reports **57 package-level findings: 30 moderate, 27 high, 0 critical**. The 27 high entries roll up to two upstream advisories, neither of which had a patched npm release at the time checked:

| Advisory | Package/range | Dependency path | Current handling |
|---|---|---|---|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` `<=3.0.3` | Jest 30's React Native preset pulls Jest 29 transform/haste-map dependencies, which use `micromatch` and `braces`. | Exact advisory is temporarily allowlisted in `scripts/check-audit-policy.js`; recheck registry status before release. |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge` `<=1.4.0` | Expo SDK CLI dependency chain. | Exact advisory is temporarily allowlisted in `scripts/check-audit-policy.js`; recheck registry status before release. |

The CI gate is **not** a blanket audit bypass: it fails on every critical finding, any other high-severity advisory, an affected-range/package mismatch, or an untraceable high finding. Run it with:

```sh
npm run audit:ci
```

The audit command itself still reports the known advisories; only the repository CI policy passes while those exact upstream issues remain without a published fix. Moderate findings remain visible and are not represented as resolved. Review package paths and run the audit again before a public store release.

## Native dependencies and updates

- The app uses Expo SDK 58-compatible versions for BlurView, MailComposer, and Updates; Expo Doctor reports all checks passing.
- OTA updates can deliver compatible JavaScript and assets only. Native-module or permission changes require a new signed Android/iOS build.
- No EAS project is linked in this workspace yet; the in-app update action is safely unavailable until the project ID and Expo token are configured.

## Sources

- [GitHub advisory: braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [GitHub advisory: node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
