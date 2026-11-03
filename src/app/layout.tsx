import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
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
        <footer className="mx-auto max-w-7xl border-t border-line px-4 py-6 text-xs leading-relaxed text-mute">
          <a href="/settings" className="mr-3 underline">About &amp; settings</a>CareChaos is a developer and educational simulator. All patients, devices and readings are fictional. It is not a clinical decision-support system, and a passing experiment does not establish clinical safety or regulatory compliance.
        </footer>
      </body>
    </html>
  );
}
