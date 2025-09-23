import fs from "fs";
import path from "path";

const IGNORE = [
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  ".turbo",
  "dist",
  "build"
];

function printTree(dir: string, prefix = "") {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  items.forEach((item, i) => {
    if (IGNORE.includes(item.name)) return;

    const isLast = i === items.length - 1;
    const pointer = isLast ? "└── " : "├── ";
    const nextPrefix = prefix + (isLast ? "    " : "│   ");
    const fullPath = path.join(dir, item.name);

    console.log(prefix + pointer + item.name);

    if (item.isDirectory()) {
      printTree(fullPath, nextPrefix);
    }
  });
}

// 👉 Start from project root
const projectRoot = path.resolve(__dirname, ".."); // one up from scripts/
console.log(path.basename(projectRoot) + "/");
printTree(projectRoot);
