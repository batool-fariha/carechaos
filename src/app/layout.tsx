import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://carechaos.vercel.app"),
  openGraph: { type: "website", siteName: "CareChaos", title: "CareChaos: chaos engineering for patient-monitoring software", description: "Break a simulated patient-monitoring pipeline on purpose and see whether alerts still reach the clinician." },
  twitter: { card: "summary_large_image" },
  title: "CareChaos — chaos engineering for remote patient-monitoring software",
  description: "A simulation-only reliability lab. Inject failures into a synthetic patient-monitoring pipeline and inspect what happens to readings and alerts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main id="main" className="mx-auto max-w-7xl px-4 py-6">
          {children}
        </main>
        <footer className="mx-auto max-w-7xl border-t border-line px-4 py-8 text-sm text-mute">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p>
              Designed and built by{" "}
              <a href="https://www.linkedin.com/in/fariha-batool/" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-2">
                Fariha Batool
              </a>
              .
            </p>
            <nav aria-label="Project links" className="flex flex-wrap gap-x-5 gap-y-2">
              <a href="https://github.com/batool-fariha" target="_blank" rel="noreferrer" className="hover:text-ink">GitHub profile ↗</a>
              <a href="https://github.com/batool-fariha/carechaos" target="_blank" rel="noreferrer" className="hover:text-ink">Source code ↗</a>
              <a href="https://www.linkedin.com/in/fariha-batool/" target="_blank" rel="noreferrer" className="hover:text-ink">LinkedIn ↗</a>
              <a href="/settings" className="hover:text-ink">About &amp; settings</a>
            </nav>
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed">
            CareChaos is a developer and educational simulator. All patients, devices and readings are fictional. It is not a clinical decision-support system, and a passing experiment does not establish clinical safety or regulatory compliance.
          </p>
        </footer>
      </body>
    </html>
  );
}
