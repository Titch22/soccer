import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// Third-party deps stay external (resolved from node_modules at runtime); the
// @soccer/shared workspace package ships as raw TS, so it must be bundled in.
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@soccer/"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external,
  sourcemap: true,
});
