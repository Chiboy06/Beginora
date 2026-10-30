// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // relay/ runs on Cloudflare Workers and supabase/ on Deno: other runtimes, other rules.
    ignores: ["dist/*", "relay/**", "supabase/**", "android/**", "ios/**"],
  },
  {
    rules: {
      // A web rule against stray HTML entities; apostrophes and quotes in React Native <Text> render as written.
      "react/no-unescaped-entities": "off",
      // Cannot see enums re-exported by expo-notifications; the TypeScript compiler checks these names.
      "import/namespace": "off",
    },
  },
  {
    // jest.mock() must run before the modules under test are imported.
    files: ["**/__tests__/**"],
    rules: { "import/first": "off" },
  },
  {
    // Node scripts run by npm, not by the app.
    files: ["scripts/**/*.js"],
    languageOptions: { globals: { __dirname: "readonly", require: "readonly", module: "readonly", process: "readonly" } },
  },
]);
