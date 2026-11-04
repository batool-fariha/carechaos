import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { githubConfig, verifySession, type Session } from "./session";

const ANON = "cc_owner";
export const SESSION_COOKIE = "cc_session";

/** The signed-in GitHub user, if any. */
export async function getSession(): Promise<Session | null> {
  const cfg = githubConfig();
  if (!cfg.enabled) return null;
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, cfg.sessionSecret);
}

/** The anonymous per-browser ID, if this browser has one. */
export async function getAnonOwner(): Promise<string | null> {
  const v = (await cookies()).get(ANON)?.value;
  return v && /^[a-f0-9]{32}$/.test(v) ? v : null;
}

/** Owner of data for this request: the GitHub account when signed in, else the anonymous browser ID. */
export async function getOwner(): Promise<string | null> {
  return (await getSession())?.uid ?? (await getAnonOwner());
}

/** Returns the existing owner or issues an anonymous one (route handlers only, where cookies can be set). */
export async function ensureOwner(): Promise<string> {
  const existing = await getOwner();
  if (existing) return existing;
  const id = randomBytes(16).toString("hex");
  (await cookies()).set(ANON, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}
