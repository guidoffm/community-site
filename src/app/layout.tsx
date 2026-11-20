import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ConfirmScript } from "@/components/confirm-script";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Communities, Nachrichten und Events",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ConfirmScript />
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
