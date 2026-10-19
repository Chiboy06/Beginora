import * as fs from "fs";
import * as path from "path";

// An Android Modal is a separate window that captures every touch, even when
// transparent with pointerEvents="box-none" inside. As the always-on bubble it
// froze the whole app whenever a task was active, so it must stay a plain view.
const source = fs.readFileSync(path.join(__dirname, "..", "..", "components", "FloatingBubble.tsx"), "utf8");

test("the floating bubble does not use a Modal", () => {
  expect(source).not.toMatch(/<Modal\b/);
});

test("its full-screen container lets touches through to the app", () => {
  expect(source).toMatch(/StyleSheet\.absoluteFill\}\s+pointerEvents="box-none"/);
});
