import crypto from "node:crypto";

const ADMIN_SESSION_COOKIE = "admin_session";
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const configuredToken = (process.env.ADMIN_TOKEN ?? "").trim();
const configuredTtlMs = Number(process.env.ADMIN_SESSION_TTL_MS ?? DEFAULT_SESSION_TTL_MS);
const sessionTtlMs = Number.isFinite(configuredTtlMs) && configuredTtlMs > 0 ? configuredTtlMs : DEFAULT_SESSION_TTL_MS;

interface SessionRecord {
  expiresAt: number;
}

const sessions = new Map<string, SessionRecord>();

function cleanupExpiredSessions(now = Date.now()): void {
  for (const [sessionId, record] of sessions.entries()) {
    if (record.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const parsed: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawKey, ...rawValueParts] = pair.trim().split("=");
    if (!rawKey) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    parsed[rawKey] = decodeURIComponent(rawValue || "");
  }

  return parsed;
}

function timingSafeTokenMatch(inputToken: string): boolean {
  const token = inputToken.trim();
  const expected = configuredToken;
  if (!expected || token.length !== expected.length) {
    return false;
  }

  const tokenBuffer = Buffer.from(token, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

export function isAdminTokenConfigured(): boolean {
  return configuredToken.length > 0;
}

export function readAdminSessionId(cookieHeader: string | undefined): string | null {
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[ADMIN_SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }
  return sessionId;
}

export function isAdminSessionValid(sessionId: string): boolean {
  cleanupExpiredSessions();
  const record = sessions.get(sessionId);
  if (!record) {
    return false;
  }
  if (record.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

export function touchAdminSession(sessionId: string): void {
  if (!isAdminSessionValid(sessionId)) {
    return;
  }
  sessions.set(sessionId, { expiresAt: Date.now() + sessionTtlMs });
}

export function revokeAdminSession(sessionId: string | null): void {
  if (!sessionId) {
    return;
  }
  sessions.delete(sessionId);
}

export function createAdminSession(token: string): { ok: true; sessionId: string } | { ok: false; error: string } {
  if (!isAdminTokenConfigured()) {
    return { ok: false, error: "伺服器尚未設定 ADMIN_TOKEN" };
  }

  if (!timingSafeTokenMatch(token)) {
    return { ok: false, error: "admin token 錯誤" };
  }

  cleanupExpiredSessions();
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, { expiresAt: Date.now() + sessionTtlMs });
  return { ok: true, sessionId };
}

export function getAdminSessionCookieName(): string {
  return ADMIN_SESSION_COOKIE;
}

export function getAdminSessionTtlMs(): number {
  return sessionTtlMs;
}
