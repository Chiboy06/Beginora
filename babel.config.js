module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
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
      // Reanimated must be last
      "react-native-reanimated/plugin",
    ],
  };
};
