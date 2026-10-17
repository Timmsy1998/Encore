import { build } from "esbuild";
await build({
  entryPoints: ["desktop/main.ts", "desktop/preload.ts"],
  outdir: "dist-electron",
  bundle: true,
  platform: "node",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
  target: "node22",
});
