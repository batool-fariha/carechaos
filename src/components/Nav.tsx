"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const links = [
  { href: "/lab", label: "Lab" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/history", label: "History" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [auth, setAuth] = useState<{ enabled: boolean; user: { login: string } | null } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setAuth).catch(() => setAuth(null));
  }, [path]);
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth((a) => (a ? { ...a, user: null } : a));
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-teal focus:px-3 focus:py-1 focus:text-bg">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo size={26} />
          <span>
            Care<span className="text-teal">Chaos</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 items-center gap-1">
          {links.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={clsx("rounded-md px-3 py-1.5 text-sm", active ? "bg-panel2 text-ink" : "text-mute hover:text-ink")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        {auth?.enabled && (
          auth.user ? (
            <span className="flex items-center gap-2 text-sm" data-testid="auth-user">
              <span className="text-mute">@{auth.user.login}</span>
              <button onClick={signOut} className="rounded border border-line px-2 py-0.5 text-xs text-mute hover:text-ink" data-testid="sign-out">Sign out</button>
            </span>
          ) : (
            <a href="/api/auth/github" className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-medium hover:border-mute/50" data-testid="sign-in">Sign in with GitHub</a>
          )
        )}
        <a href="https://github.com/batool-fariha/carechaos" target="_blank" rel="noreferrer" className="text-sm text-mute hover:text-ink">
          GitHub ↗
        </a>
      </div>
    </header>
  );
}
