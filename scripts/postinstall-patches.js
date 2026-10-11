const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

function replaceText(relativePath, from, to, description) {
  const target = path.join(projectRoot, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`Cannot apply ${description}: file not found at ${target}`);
  }

  const contents = fs.readFileSync(target, "utf8");
  if (contents.includes(to)) {
    process.stdout.write(`${description}: already applied.\n`);
    return;
  }
  if (!contents.includes(from)) {
    throw new Error(`Cannot apply ${description}: expected source text was not found.`);
  }

  fs.writeFileSync(target, contents.replace(from, to));
  process.stdout.write(`${description}: applied.\n`);
}

function replacePattern(relativePath, marker, pattern, replacement, description) {
  const target = path.join(projectRoot, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`Cannot apply ${description}: file not found at ${target}`);
  }

  const contents = fs.readFileSync(target, "utf8");
  if (contents.includes(marker)) {
    process.stdout.write(`${description}: already applied.\n`);
    return;
  }

  const updated = contents.replace(pattern, replacement);
  if (updated === contents) {
    throw new Error(`Cannot apply ${description}: expected source pattern was not found.`);
  }

  fs.writeFileSync(target, updated);
  process.stdout.write(`${description}: applied.\n`);
}

replaceText(
  "node_modules/@react-native/gradle-plugin/settings.gradle.kts",
  'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }',
  'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }',
  "React Native Gradle Foojay resolver compatibility",
);

replaceText(
  "node_modules/llama.rn/lib/module/expo-plugin/withLlamaRN.js",
  "import pkg from '@expo/config-plugins';",
  "import pkg from 'expo/config-plugins';",
  "llama.rn Expo config-plugin import (ESM)",
);
replaceText(
  "node_modules/llama.rn/lib/commonjs/expo-plugin/withLlamaRN.js",
  'require("@expo/config-plugins")',
  'require("expo/config-plugins")',
  "llama.rn Expo config-plugin import (CommonJS)",
);
replaceText(
  "node_modules/llama.rn/lib/typescript/expo-plugin/withLlamaRN.d.ts",
  "from '@expo/config-plugins'",
  "from 'expo/config-plugins'",
  "llama.rn Expo config-plugin type import",
);

replacePattern(
  "node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  "PDF.js worker module must be preloaded by Beginora.",
  /const worker = await import\(\s*\/\*webpackIgnore: true\*\/\s*\/\*@vite-ignore\*\/\s*this\.workerSrc\);/,
  'const worker = globalThis.pdfjsWorker;\n      if (!worker) {\n        throw new Error("PDF.js worker module must be preloaded by Beginora.");\n      }',
  "PDF.js fake-worker import fallback",
);

replacePattern(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "const decoderFilename = this._noWasmFilename;",
  /const mod = await import\(\s*\/\*webpackIgnore: true\*\/\s*\/\*@vite-ignore\*\/\s*`\$\{WasmImage\.#wasmUrl\}\$\{this\._noWasmFilename\}`\);\s*instance = mod\.default\(\);/,
  'const decoderFilename = this._noWasmFilename;\n      const mod = decoderFilename === "jbig2_nowasm_fallback.js"\n        ? require("pdfjs-dist/wasm/jbig2_nowasm_fallback.js")\n        : decoderFilename === "openjpeg_nowasm_fallback.js"\n          ? require("pdfjs-dist/wasm/openjpeg_nowasm_fallback.js")\n          : null;\n      if (!mod) throw new Error("Unsupported PDF.js decoder fallback: " + decoderFilename);\n      instance = mod.default();',
  "PDF.js static JavaScript image-decoder fallback",
);
