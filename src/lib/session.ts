import { createHmac, timingSafeEqual } from "node:crypto";

export interface Session {
  /** Owner ID used to scope experiments, e.g. "gh:12345". */
  uid: string;
  login: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function signSession(s: Session, secret: string): string {
  const body = b64(JSON.stringify(s));
  return `${body}.${mac(body, secret)}`;
}

/** Returns the session if the signature is valid and it has not expired; otherwise null. */
export function verifySession(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = mac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (typeof s.uid !== "string" || !s.uid.startsWith("gh:") || typeof s.login !== "string" || typeof s.exp !== "number" || s.exp < now) return null;
    return s;
  } catch {
    return null;
  }
}

export function githubConfig() {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const enabled = !!(id && secret && sessionSecret && sessionSecret.length >= 32);
  return {
    enabled,
    clientId: id ?? "",
    clientSecret: secret ?? "",
    sessionSecret: sessionSecret ?? "",
    oauthBase: process.env.GITHUB_OAUTH_BASE ?? "https://github.com",
    apiBase: process.env.GITHUB_API_BASE ?? "https://api.github.com",
  };
}
