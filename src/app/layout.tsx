import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ConfirmScript } from "@/components/confirm-script";
import { APP_NAME, IMPRINT_URL, OPERATOR_NAME, PRIVACY_URL, siteUrl } from "@/lib/domains";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Communities, Nachrichten, Events und Fotos – für alle, die zusammengehören.",
};

export const viewport: Viewport = { themeColor: "#7c3aed" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="flex min-h-screen flex-col">
        <ConfirmScript />
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="mt-12 border-t border-violet-100 bg-white/60">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500">
            <a href={siteUrl("/")} className="font-display font-extrabold text-gradient">{APP_NAME}</a>
            <span>Ein Angebot der {OPERATOR_NAME}</span>
            <nav className="flex gap-4">
              <a href={IMPRINT_URL} className="hover:text-brand hover:underline">Impressum</a>
              <a href={PRIVACY_URL} className="hover:text-brand hover:underline">Datenschutz</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
