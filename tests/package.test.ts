import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
	files?: string[];
	pi?: { skills?: string[] };
};

assert.ok(pkg.pi?.skills?.includes("./skills"), "pi manifest should expose packaged skills");
assert.ok(pkg.files?.includes("skills/"), "npm package files should include the skills directory");

console.log("package metadata tests passed");
