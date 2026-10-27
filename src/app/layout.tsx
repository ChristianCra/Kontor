import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Kontor",
  description: "Rechnungen, Belege und Buchhaltung für Selbstständige und kleine Unternehmen",
};

const NAV = [
  { href: "/", label: "Übersicht" },
  { href: "/kontakte", label: "Kontakte" },
  { href: "/artikel", label: "Artikel" },
  { href: "/angebote", label: "Angebote" },
  { href: "/rechnungen", label: "Rechnungen" },
  { href: "/belege", label: "Belege" },
  { href: "/bank", label: "Bank" },
  { href: "/anlagen", label: "Anlagen" },
  { href: "/steuern/ustva", label: "UStVA" },
  { href: "/steuern/euer", label: "EÜR" },
  { href: "/steuern/datev", label: "DATEV-Export" },
  { href: "/freigaben", label: "Freigaben" },
  { href: "/protokoll", label: "Protokoll" },
  { href: "/einstellungen", label: "Einstellungen" },
];

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    // Anmeldeseite ohne Navigation
    return (
      <html lang="de">
        <body className="antialiased"><main className="p-4">{children}</main></body>
      </html>
    );
  }
  const pendingApprovals = await db.approval.count({ where: { status: "pending" } });
  return (
    <html lang="de">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-border bg-surface md:w-56 md:border-b-0 md:border-r">
            <div className="px-5 py-4 text-lg font-semibold text-accent">Kontor</div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm hover:bg-background">
                  {n.label}
                  {n.href === "/freigaben" && pendingApprovals > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-fg">{pendingApprovals}</span>}
                </Link>
              ))}
            </nav>
            <div className="border-t border-border px-5 py-3 text-xs text-muted">
              <div className="truncate">{user.name || user.email}</div>
              <div className="mt-1 flex gap-3">
                <Link href="/einstellungen/benutzer" className="hover:underline">Benutzer</Link>
                <form action={logout}><button className="hover:underline">Abmelden</button></form>
              </div>
            </div>
          </aside>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
