import express from "express";
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
const isProd = process.env.NODE_ENV === "production";
const adminSessionCookieName = getAdminSessionCookieName();
const adminSessionTtlMs = getAdminSessionTtlMs();
const adminCookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProd,
  path: "/"
};

app.use(express.json());

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
    ...adminCookieBase,
    maxAge: adminSessionTtlMs
  });
  res.json({ ok: true });
});

app.post("/admin/logout", (req, res) => {
  const sessionId = readAdminSessionId(req.headers.cookie);
  revokeAdminSession(sessionId);
  res.clearCookie(adminSessionCookieName, adminCookieBase);
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
  // eslint-disable-next-line no-console
  console.log(`Socket server listening on http://localhost:${PORT}`);
});
