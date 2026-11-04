import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { claimExperiments } from "@/lib/db";
import { getAnonOwner, SESSION_COOKIE } from "@/lib/owner";
import { githubConfig, signSession } from "@/lib/session";
import { siteOrigin } from "../route";

export const dynamic = "force-dynamic";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function back(req: Request, error?: string) {
  const u = new URL(error ? "/history" : "/history", siteOrigin(req));
  if (error) u.searchParams.set("auth_error", error);
  const res = NextResponse.redirect(u);
  res.cookies.delete("cc_oauth_state");
  return res;
}

export async function GET(req: Request) {
  const cfg = githubConfig();
  if (!cfg.enabled) return NextResponse.json({ error: "GitHub sign-in is not configured." }, { status: 404 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const saved = (await cookies()).get("cc_oauth_state")?.value ?? "";
  const ok = state.length > 0 && state.length === saved.length && timingSafeEqual(Buffer.from(state), Buffer.from(saved));
  if (!code || !ok) return back(req, "state");
  try {
    const tokenRes = await fetch(`${cfg.oauthBase}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "CareChaos" },
      body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: `${siteOrigin(req)}/api/auth/github/callback` }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) return back(req, "token");
    const userRes = await fetch(`${cfg.apiBase}/user`, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "CareChaos" } });
    const user = (await userRes.json()) as { id?: number; login?: string };
    if (!user.id || !user.login) return back(req, "profile");
    // The access token is discarded here: only the numeric ID and login are kept, in a signed cookie.
    const uid = `gh:${user.id}`;
    const anon = await getAnonOwner();
    if (anon) await claimExperiments(anon, uid);
    const res = back(req);
    res.cookies.set(SESSION_COOKIE, signSession({ uid, login: user.login, exp: Date.now() + THIRTY_DAYS * 1000 }, cfg.sessionSecret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: THIRTY_DAYS,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "github oauth failure", error: String(e) }));
    return back(req, "failed");
  }
}
