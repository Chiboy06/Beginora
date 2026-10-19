import * as fs from "fs";
import * as path from "path";

// Expo Router maps files under app/ to URLs, ignoring (group) folders. Two files
// with the same URL make one silently win: that hid the tab bar and header
// (the only way off the chat screen) when app/index.tsx shadowed app/(tabs)/index.tsx.
const APP_DIR = path.join(__dirname, "..", "..", "app");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

function urlFor(file: string): string | null {
  const rel = path.relative(APP_DIR, file).split(path.sep).join("/").replace(/\.(tsx|ts)$/, "");
  const name = rel.split("/").pop() ?? "";
  if (name.startsWith("_") || name.startsWith("+")) return null; // layouts and special files
  const url = rel
    .split("/")
    .filter((seg) => !/^\(.*\)$/.test(seg))
    .filter((seg, i, all) => !(seg === "index" && i === all.length - 1))
    .join("/");
  return "/" + url;
}

test("no two app/ files resolve to the same URL", () => {
  const byUrl = new Map<string, string[]>();
  for (const file of routeFiles(APP_DIR)) {
    const url = urlFor(file);
    if (url) byUrl.set(url, [...(byUrl.get(url) ?? []), path.relative(APP_DIR, file)]);
  }
  const duplicates = [...byUrl].filter(([, files]) => files.length > 1);
  expect(duplicates).toEqual([]);
});

test("the home URL is the Today tab, so the tab bar is shown", () => {
  const home = routeFiles(APP_DIR).filter((file) => urlFor(file) === "/");
  expect(home.map((file) => path.relative(APP_DIR, file).split(path.sep).join("/"))).toEqual(["(tabs)/index.tsx"]);
});
