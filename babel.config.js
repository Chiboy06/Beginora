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
      // Reanimated 4's Worklets plugin must be last
      "react-native-worklets/plugin",
    ],
  };
};
