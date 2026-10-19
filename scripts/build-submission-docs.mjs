// Builds the Devpost submission PDFs with headless Microsoft Edge (or Chrome):
//   docs/submission/Beginora-Project-Description.pdf  (from project-description.html)
//   docs/submission/Beginora-Code.pdf                 (every tracked source and test file)
//
//   node scripts/build-submission-docs.mjs
// Set BROWSER_PATH to use another Chromium-based browser.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs", "submission");

const browser = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!browser) {
  console.error("No Chromium-based browser found. Set BROWSER_PATH.");
  process.exit(1);
}

function printToPdf(htmlPath, pdfPath) {
  // A separate profile stops an already-open browser window from taking over the call.
  const profile = mkdtempSync(join(tmpdir(), "beginora-pdf-"));
  rmSync(pdfPath, { force: true });
  execFileSync(browser, [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: "ignore", timeout: 180_000 });
  // On Windows the launcher exits before the browser finishes writing, so wait
  // until the file exists and its size has stopped changing.
  const deadline = Date.now() + 180_000;
  let lastSize = -1;
  while (Date.now() < deadline) {
    const size = existsSync(pdfPath) ? statSync(pdfPath).size : -1;
    if (size > 0 && size === lastSize) break;
    lastSize = size;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    // The browser can still hold its temp profile for a moment; leftover temp files are harmless.
  }
  if (!existsSync(pdfPath)) throw new Error(`PDF not written: ${pdfPath}`);
  console.log(`wrote ${pdfPath} (${statSync(pdfPath).size} bytes)`);
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Code developed for the project: app, components, libraries, native Android
// code, config plugins, scripts and config. Tests are listed separately.
const SOURCE = /^(app|components|lib|native|plugins|scripts|types)\/|^(index\.ts|app\.json|app\.config\.ts|package\.json|babel\.config\.js|jest\.config\.js|eslint\.config\.js|tsconfig\.json)$/;
const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => SOURCE.test(f) && /\.(ts|tsx|mts|js|mjs|kt|json|xml)$/.test(f));
const tests = files.filter((f) => f.includes("__tests__/"));
const code = files.filter((f) => !f.includes("__tests__/"));

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const section = (title, list) => list.map((f) => {
  const text = readFileSync(join(root, f), "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n").length;
  return `<section><h3 id="${escapeHtml(f)}">${escapeHtml(f)} <span>${lines} lines</span></h3><pre>${escapeHtml(text)}</pre></section>`;
}).join("");
const toc = (list) => `<ol>${list.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ol>`;
const totalLines = (list) => list.reduce((n, f) => n + readFileSync(join(root, f), "utf8").split("\n").length, 0);

const codeHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Beginora source code</title><style>
@page { size: A4; margin: 12mm; }
body { font: 9pt/1.35 "Segoe UI", system-ui, sans-serif; color: #1c1c1e; }
h1 { color: #467565; margin: 0 0 4pt; } h2 { color: #467565; page-break-before: always; }
h3 { font-size: 9.5pt; margin: 10pt 0 3pt; padding: 3pt 5pt; background: #eaf0ed; border-radius: 3pt; }
h3 span { float: right; font-weight: normal; color: #4a4a50; }
pre { font: 7.2pt/1.3 Consolas, "Cascadia Mono", monospace; white-space: pre-wrap; word-break: break-word; margin: 0; }
ol { columns: 2; font-size: 8pt; } section { break-inside: auto; }
</style></head><body>
<h1>Beginora: source code</h1>
<p>Repository github.com/Chiboy06/Beginora, commit ${commit}. ${code.length} source files (${totalLines(code)} lines) and ${tests.length} test files (${totalLines(tests)} lines). Third-party packages (node_modules) are not included.</p>
<h2 style="page-break-before:avoid">Contents: source</h2>${toc(code)}
<h2>Contents: tests</h2>${toc(tests)}
<h2>Source</h2>${section("Source", code)}
<h2>Tests</h2>${section("Tests", tests)}
</body></html>`;

const codeHtmlPath = join(out, "code.generated.html");
writeFileSync(codeHtmlPath, codeHtml);
printToPdf(join(out, "project-description.html"), join(out, "Beginora-Project-Description.pdf"));
printToPdf(codeHtmlPath, join(out, "Beginora-Code.pdf"));
