import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const SERVER_URL = "http://127.0.0.1:3100/login";

async function waitForServer(child: ChildProcess) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`E2E Next.js server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(SERVER_URL, { method: "HEAD" });
      if (response.ok) return;
    } catch {
      // The dev server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${SERVER_URL}.`);
}

export default async function globalSetup() {
  const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3100"],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout?.on("data", (chunk) => process.stdout.write(`[e2e-server] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[e2e-server] ${chunk}`));
  await waitForServer(child);

  return async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  };
}
