import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { githubConfig } from "@/lib/session";

export const dynamic = "force-dynamic";

export function siteOrigin(req: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
}

/** Starts "Sign in with GitHub". Returns 404 when sign-in is not configured. */
export async function GET(req: Request) {
  const cfg = githubConfig();
  if (!cfg.enabled) return NextResponse.json({ error: "GitHub sign-in is not configured on this deployment." }, { status: 404 });
  const state = randomBytes(16).toString("hex");
  const url = new URL(`${cfg.oauthBase}/login/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", `${siteOrigin(req)}/api/auth/github/callback`);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("cc_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}
