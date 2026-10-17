import { spawn } from "node:child_process";
import { resolve } from "node:path";
const executable = resolve(
  ".runtime",
  process.platform,
  process.platform === "win32" ? "electron.exe" : "electron",
);
const child = spawn(executable, ["."], { stdio: "inherit", env: process.env });
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
