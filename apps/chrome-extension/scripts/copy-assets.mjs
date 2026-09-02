import { copyFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
await Promise.all(["manifest.json", "popup.html", "popup.css"].map((name) => copyFile(new URL(name, root), new URL(name, output))));
