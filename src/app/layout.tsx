import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kontor",
  description: "Rechnungen, Belege und Buchhaltung für Selbstständige und kleine Unternehmen",
};

const NAV = [
  { href: "/", label: "Übersicht" },
  { href: "/kontakte", label: "Kontakte" },
  { href: "/artikel", label: "Artikel" },
  { href: "/rechnungen", label: "Rechnungen" },
  { href: "/einstellungen", label: "Einstellungen" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
