/**
 * Собственная система авторизации (без внешних провайдеров):
 * — пароли: node:crypto scrypt;
 * — сессии: HMAC-подписанные токены (node:crypto, без внешних зависимостей);
 * — Google / Apple OAuth: проверка id_token через JWKS (fetch), dev-режим без ключей.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "tp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

// ---------- Пароли (scrypt) ----------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---------- Сессионные токены (HMAC) ----------
function secret(): string {
  return process.env.APP_SESSION_SECRET || "dev-session-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(customerId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: customerId, exp: Date.now() + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: number; exp: number };
    if (!Number.isInteger(data.uid) || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, customerId: number): void {
  res.cookie(COOKIE_NAME, createSessionToken(customerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

export function sessionCustomerId(req: Request): number | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const fromBearer = readSessionToken(header.slice(7));
    if (fromBearer) return fromBearer;
  }
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return readSessionToken(cookies?.[COOKIE_NAME] ?? cookieFromHeader(req, COOKIE_NAME));
}

function cookieFromHeader(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

// ---------- Проверка id_token провайдеров (Google / Apple) ----------
type JwksKey = { kid?: string; alg?: string; kty: string; n?: string; e?: string; x?: string; y?: string; crv?: string };
const jwksCache = new Map<string, { at: number; keys: JwksKey[] }>();
const JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(url: string): Promise<JwksKey[]> {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
  const json = (await resp.json()) as { keys?: JwksKey[] };
  const keys = json.keys ?? [];
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}

function base64UrlJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString());
}

function importJwk(key: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", key as Record<string, unknown>, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
}

async function verifyJwt(idToken: string, opts: { issuer: string | string[]; audience: string; jwksUrl: string }): Promise<Record<string, unknown>> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Некорректный токен");
  const header = base64UrlJson(parts[0]);
  const payload = base64UrlJson(parts[1]);
  const keys = await fetchJwks(opts.jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid) ?? keys[0];
  if (!jwk) throw new Error("Ключ не найден");
  const key = await importJwk(jwk);
  const signatureOk = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(parts[2], "base64url"),
    Buffer.from(`${parts[0]}.${parts[1]}`),
  );
  if (!signatureOk) throw new Error("Подпись токена недействительна");
  const iss = String(payload.iss ?? "");
  const issuers = Array.isArray(opts.issuer) ? opts.issuer : [opts.issuer];
  if (!issuers.includes(iss)) throw new Error("Неизвестный издатель токена");
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(opts.audience) : aud === opts.audience;
  if (!audOk) throw new Error("Токен выпущен для другого приложения");
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) throw new Error("Токен истёк");
  return payload;
}

export interface ProviderIdentity {
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Google: id_token от GSI. Требует GOOGLE_CLIENT_ID; без него — dev-режим. */
export async function verifyGoogleIdToken(idToken: string): Promise<ProviderIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const payload = base64UrlJson(idToken.split(".")[1] ?? "");
    if (!payload.sub) throw new Error("Некорректный Google-токен");
    return {
      providerSub: String(payload.sub),
      email: payload.email ? String(payload.email) : null,
      emailVerified: true,
      name: payload.name ? String(payload.name) : null,
    };
  }
  const payload = await verifyJwt(idToken, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  });
  return {
    providerSub: String(payload.sub),
    email: payload.email ? String(payload.email) : null,
    emailVerified: payload.email_verified === true,
    name: payload.name ? String(payload.name) : null,
  };
}

/** Apple: identity token из Sign in with JS. Требует APPLE_CLIENT_ID; без него — dev-режим. */
export async function verifyAppleIdToken(idToken: string): Promise<ProviderIdentity> {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    const payload = base64UrlJson(idToken.split(".")[1] ?? "");
    if (!payload.sub) throw new Error("Некорректный Apple-токен");
    const email = payload.email ? String(payload.email) : null;
    return {
      providerSub: String(payload.sub),
      email,
      emailVerified: true,
      name: typeof payload.name === "object" && payload.name !== null
        ? [String((payload.name as Record<string, unknown>).firstName ?? ""), String((payload.name as Record<string, unknown>).lastName ?? "")].join(" ").trim() || null
        : null,
    };
  }
  const payload = await verifyJwt(idToken, {
    issuer: "https://appleid.apple.com",
    audience: clientId,
    jwksUrl: "https://appleid.apple.com/auth/keys",
  });
  return {
    providerSub: String(payload.sub),
    email: payload.email ? String(payload.email) : null,
    emailVerified: payload.is_private_email_email_verified === true || payload.email_verified === true,
    name: null,
  };
}

export function isOAuthConfigured(provider: "google" | "apple"): boolean {
  return provider === "google" ? Boolean(process.env.GOOGLE_CLIENT_ID) : Boolean(process.env.APPLE_CLIENT_ID);
}

/** Коды подтверждения для регистрации по телефону / e-mail. В dev — возвращаем в ответе. */
const codeStore = new Map<string, { code: string; expiresAt: number }>();

export function issueCode(key: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codeStore.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  return code;
}

export function checkCode(key: string, code: string): boolean {
  const entry = codeStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) return false;
  if (entry.code !== code.trim()) return false;
  codeStore.delete(key);
  return true;
}
