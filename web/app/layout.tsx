import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "./nav";

export const metadata = { title: "Radar de Ofertas" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topbar">
          <Link href="/" className="logo" aria-label="Radar de Ofertas, início">
            <span className="scope" aria-hidden="true" />
            <span><span className="tag">&lt;</span><span className="name">radar</span><span className="tag">/&gt;</span></span>
          </Link>
          <Nav />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
