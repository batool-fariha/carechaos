"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const links = [
  { href: "/lab", label: "Lab" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/history", label: "History" },
];

export function Nav() {
  const path = usePathname();
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
        <a href="https://github.com/batool-fariha/carechaos" target="_blank" rel="noreferrer" className="text-sm text-mute hover:text-ink">
          GitHub ↗
        </a>
      </div>
    </header>
  );
}
