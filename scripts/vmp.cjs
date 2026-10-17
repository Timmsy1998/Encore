// Windows VMP signing must follow Authenticode and precede NSIS/portable archiving.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawnSync } = require("node:child_process");
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "win32") return;
  if (process.env.ENCORE_VMP_SIGN !== "1") {
    console.warn(
      "Widevine VMP signing skipped. This build requires Spotify/DRM verification before distribution.",
    );
    return;
  }
  const result = spawnSync(
    process.env.ENCORE_PYTHON || "python",
    ["-m", "castlabs_evs.vmp", "sign-pkg", context.appOutDir],
    {
      stdio: "inherit",
      env: { ...process.env, EVS_NO_ASK: "1" },
      timeout: 180000,
    },
  );
  if (result.error || result.status !== 0)
    throw Error(
      "Widevine VMP signing failed. Reauthenticate the EVS client and retry.",
    );
};
