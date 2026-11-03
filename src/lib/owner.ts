import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "cc_owner";

/** Anonymous per-browser identity: a random ID in an httpOnly cookie. No accounts, no personal data. */
export async function getOwner(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v && /^[a-f0-9]{32}$/.test(v) ? v : null;
}

/** Returns the existing owner or issues a new one (route handlers only, where cookies can be set). */
export async function ensureOwner(): Promise<string> {
  const existing = await getOwner();
  if (existing) return existing;
  const id = randomBytes(16).toString("hex");
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}
