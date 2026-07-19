// One-time OAuth flow for the Google Forms API (forms.body scope).
// Prereq: evals/tools/credentials/client_secret.json (Desktop OAuth client JSON).
// Run: npm run auth  — opens a URL to approve, then caches credentials/token.json.
import fs from "fs";
import http from "http";
import path from "path";
import { google } from "googleapis";
import { CREDENTIALS_DIR } from "./lib/env.mjs";

const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, "client_secret.json");
const TOKEN_PATH = path.join(CREDENTIALS_DIR, "token.json");
const SCOPES = ["https://www.googleapis.com/auth/forms.body"];
const PORT = 53682;

function loadClientSecret() {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.error(`Missing ${CLIENT_SECRET_PATH}`);
    console.error(
      "Download the Desktop OAuth client JSON from Google Cloud Console → APIs & Services → Credentials, and save it at that path."
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
  const conf = raw.installed ?? raw.web;
  if (!conf) throw new Error("client_secret.json has neither 'installed' nor 'web' key");
  return conf;
}

const { client_id, client_secret } = loadClientSecret();
const redirectUri = `http://127.0.0.1:${PORT}/oauth2callback`;
const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirectUri);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error || !code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`Authorization failed: ${error ?? "no code returned"}`);
      console.error(`Authorization failed: ${error ?? "no code returned"}`);
      process.exit(1);
    }
    const { tokens } = await oauth2.getToken(code);
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Authorization complete. You can close this tab and return to the terminal.");
    console.log(`Token saved to ${TOKEN_PATH}`);
    server.close(() => process.exit(0));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Token exchange failed — see terminal.");
    console.error("Token exchange failed:", err.message);
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(authUrl + "\n");
  console.log(`Waiting for the redirect on ${redirectUri} ...`);
});
