import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  external: ["electron"],
  minify: true,
  sourcemap: false,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["apps/desktop/electron/main.ts"],
  outfile: "dist-electron/electron/main.js",
  format: "esm",
});

await build({
  ...common,
  entryPoints: ["apps/desktop/electron/preload.ts"],
  outfile: "dist-electron/electron/preload.cjs",
  format: "cjs",
});
