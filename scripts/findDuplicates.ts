import fs from "fs";
import path from "path";

const SRC_ROOT = path.resolve(process.cwd(), "src");

const seenFiles: Record<string, string[]> = {};
const seenRoutes: Record<string, string[]> = {};

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
    } else {
      const name = entry.name;

      // --- Track duplicate filenames ---
      if (!seenFiles[name]) seenFiles[name] = [];
      seenFiles[name].push(fullPath);

      // --- Track duplicate API routes (route.ts only) ---
      if (name === "route.ts") {
        const parent = path.basename(path.dirname(fullPath)); // the API folder name
        if (!seenRoutes[parent]) seenRoutes[parent] = [];
        seenRoutes[parent].push(fullPath);
      }
    }
  }
}

walk(SRC_ROOT);

// --- Utility: pick preferred path ---
function suggestPreferred(paths: string[]): string {
  // 1. Prefer non-_test
  const nonTest = paths.filter((p) => !p.includes("_test"));
  if (nonTest.length === 1) return nonTest[0];

  // 2. Prefer src/utils over src/app/utils
  const utils = paths.find((p) => p.includes("src\\utils") || p.includes("src/utils"));
  if (utils) return utils;

  // fallback = first
  return paths[0];
}

console.log("🔎 Duplicate files check:\n");
let foundFiles = false;
for (const [file, paths] of Object.entries(seenFiles)) {
  if (paths.length > 1) {
    foundFiles = true;
    console.log(`⚠️  ${file} appears in:`);
    for (const p of paths) console.log("   - " + p);

    const keep = suggestPreferred(paths);
    console.log(`👉 Suggested keep: ${keep}`);
    console.log();
  }
}
if (!foundFiles) console.log("✅ No duplicate filenames found.\n");

console.log("🔎 Duplicate API route check:\n");
let foundRoutes = false;
for (const [folder, paths] of Object.entries(seenRoutes)) {
  if (paths.length > 1) {
    foundRoutes = true;
    console.log(`⚠️  Multiple route.ts files for endpoint "${folder}":`);
    for (const p of paths) console.log("   - " + p);

    const keep = suggestPreferred(paths);
    console.log(`👉 Suggested keep: ${keep}`);
    console.log();
  }
}
if (!foundRoutes) console.log("✅ No duplicate API routes found.\n");
