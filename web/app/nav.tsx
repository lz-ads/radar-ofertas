"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", file: "ranking", ext: ".tsx" },
  { href: "/funil", file: "funil", ext: ".tsx" },
  { href: "/reclame-aqui", file: "reclame-aqui", ext: ".tsx" },
  { href: "/palavras-chave", file: "palavras-chave", ext: ".tsx" },
  { href: "/status", file: "status", ext: ".log" },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/oferta") : path.startsWith(href));
  return (
    <nav className="tabs" aria-label="Seções">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
          {t.file}<span className="ext">{t.ext}</span>
        </Link>
      ))}
    </nav>
  );
}
