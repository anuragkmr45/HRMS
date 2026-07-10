import { spawn } from "node:child_process";

process.env.NITRO_PRESET = process.env.NITRO_PRESET || "vercel";

const command = process.platform === "win32" ? "vite.cmd" : "vite";
const child = spawn(command, ["build"], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
