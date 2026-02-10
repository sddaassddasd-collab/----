import express, { type CookieOptions, type Request } from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "../../shared/types.js";
import {
  createAdminSession,
  getAdminSessionCookieName,
  getAdminSessionTtlMs,
  isAdminSessionValid,
  isAdminTokenConfigured,
  readAdminSessionId,
  revokeAdminSession,
  touchAdminSession
} from "./adminAuth.js";
import { registerSocketHandlers } from "./socket.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();
const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: "*" }
});

registerSocketHandlers(io);

const publicDir = path.resolve(process.cwd(), "public");
const adminSessionCookieName = getAdminSessionCookieName();
const adminSessionTtlMs = getAdminSessionTtlMs();
const adminSessionCookieSecureMode = (process.env.ADMIN_SESSION_COOKIE_SECURE ?? "auto").trim().toLowerCase();
const adminCookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/"
};

app.use(express.json());

function parseSecureMode(value: string): boolean | null {
  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }
  return null;
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return typeof value === "string" ? value : "";
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"])
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  return req.secure || forwardedProto === "https";
}

function buildAdminCookieOptions(req: Request): CookieOptions {
  const secureOverride = parseSecureMode(adminSessionCookieSecureMode);
  const secure = secureOverride === null ? isHttpsRequest(req) : secureOverride;
  return {
    ...adminCookieBase,
    secure
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/admin/login", (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const result = createAdminSession(token);
  if (!result.ok) {
    const status = isAdminTokenConfigured() ? 401 : 503;
    res.status(status).json({ ok: false, error: result.error });
    return;
  }

  res.cookie(adminSessionCookieName, result.sessionId, {
    ...buildAdminCookieOptions(req),
    maxAge: adminSessionTtlMs
  });
  res.json({ ok: true });
});

app.post("/admin/logout", (req, res) => {
  const sessionId = readAdminSessionId(req.headers.cookie);
  revokeAdminSession(sessionId);
  res.clearCookie(adminSessionCookieName, buildAdminCookieOptions(req));
  res.json({ ok: true });
});

app.get("/admin/session", (req, res) => {
  const sessionId = readAdminSessionId(req.headers.cookie);
  const authenticated = sessionId ? isAdminSessionValid(sessionId) : false;
  if (authenticated && sessionId) {
    touchAdminSession(sessionId);
  }

  res.json({
    ok: true,
    authenticated,
    tokenConfigured: isAdminTokenConfigured()
  });
});

app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.redirect("/player");
});

app.get("/player", (_req, res) => {
  res.sendFile(path.join(publicDir, "player.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  if (!isAdminTokenConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("ADMIN_TOKEN 未設定，後台 token 登入目前不可用。");
  }
  if (parseSecureMode(adminSessionCookieSecureMode) === null) {
    // eslint-disable-next-line no-console
    console.log("ADMIN_SESSION_COOKIE_SECURE=auto（依請求是否 HTTPS 自動決定 secure cookie）");
  }
  // eslint-disable-next-line no-console
  console.log(`Socket server listening on http://localhost:${PORT}`);
});
