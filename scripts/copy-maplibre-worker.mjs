// MapLibre v6 runs its tile parsing in a module Web Worker that it looks for
// next to its own bundle. Bundlers don't emit that file, so serve a copy from
// public/ and point MapLibre at it (see setWorkerUrl in BenchMap.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = new URL("../public/maplibre/", import.meta.url).pathname;

mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), join(out, file));
}
