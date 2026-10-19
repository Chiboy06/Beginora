import * as fs from "fs";
import * as path from "path";

// In Expo SDK 58 the classic expo-calendar and expo-contacts functions imported
// from the package root are stubs that throw at runtime ("This method will throw
// in runtime"). Jest mocks hid it; on phones the calendar showed "unavailable"
// and contact lookups for calls and texts failed. They must come from "/legacy".
const ROOT = path.join(__dirname, "..", "..");
const DIRS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

test.each(["expo-calendar", "expo-contacts"])("%s is imported from its /legacy entry", (pkg) => {
  const offenders = DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)))
    .filter((file) => fs.readFileSync(file, "utf8").includes(`from "${pkg}"`))
    .map((file) => path.relative(ROOT, file));
  expect(offenders).toEqual([]);
});
