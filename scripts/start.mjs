import { spawn } from "node:child_process";
import { config } from "dotenv";
import ngrok from "@ngrok/ngrok";

config();

const port = Number(process.env.PORT ?? 3001);
const frontend = "http://127.0.0.1:5173";

if (!process.env.NGROK_AUTHTOKEN) {
  console.error("NGROK_AUTHTOKEN is missing from .env");
  process.exit(1);
}

const children = [];
let listener;
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  void listener?.close();
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function waitForApi() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // API still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`GaragePay API did not start on port ${port}`);
}

const api = spawn("npx", ["tsx", "server/index.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(port),
    FRONTEND_URL: frontend,
  },
});
children.push(api);
api.on("exit", (code) => {
  if (!shuttingDown && code && code !== 0) {
    console.error("API process exited");
    shutdown();
  }
});

try {
  await waitForApi();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown();
}

listener = await ngrok.forward({
  addr: port,
  authtoken: process.env.NGROK_AUTHTOKEN,
});
const appUrl = listener.url()?.replace(/\/$/, "");
if (!appUrl) {
  console.error("ngrok did not return a public URL");
  shutdown();
}

const assigned = await fetch(`http://127.0.0.1:${port}/internal/app-url`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: appUrl }),
});
if (!assigned.ok) {
  console.error("Could not assign APP_URL from ngrok");
  shutdown();
}

const ui = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
  stdio: "inherit",
  env: process.env,
});
children.push(ui);

console.log("");
console.log("GaragePay sandbox is up");
console.log(`UI:      ${frontend}`);
console.log(`Webhook: ${appUrl}/api/paymob/webhook`);
console.log("Pay with a Paymob test card after Karim sends the quote.");
console.log("");
