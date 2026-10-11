module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "babel-preset-expo",
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@": ".",
            "@components": "./components",
            "@lib": "./lib",
            "@app": "./app",
          },
        },
      ],
      // Worklets must come before Reanimated; Reanimated plugin must be last.
      "react-native-worklets/plugin",
      "react-native-reanimated/plugin",
    ],
  };
};
