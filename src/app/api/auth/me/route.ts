import { NextResponse } from "next/server";
import { getSession } from "@/lib/owner";
import { githubConfig } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Whether GitHub sign-in is available, and who is signed in. Never returns tokens or IDs. */
export async function GET() {
  const enabled = githubConfig().enabled;
  const s = enabled ? await getSession() : null;
  return NextResponse.json({ enabled, user: s ? { login: s.login } : null });
}
