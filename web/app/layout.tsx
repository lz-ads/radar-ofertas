import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Radar de Ofertas" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="top">
          <strong>Radar de Ofertas</strong>
          <nav>
            <Link href="/">Ranking</Link>
            <Link href="/reclame-aqui">Reclame Aqui</Link>
            <Link href="/palavras-chave">Palavras-chave</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
