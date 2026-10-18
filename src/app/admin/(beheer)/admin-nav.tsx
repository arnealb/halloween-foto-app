"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Admin sections. Later sections (reveal, ...) are added here. */
const SECTIONS = [
  { href: "/admin", label: "Overzicht" },
  { href: "/admin/fotos", label: "Foto's" },
  { href: "/admin/instellingen", label: "Instellingen" },
  { href: "/admin/watermark", label: "Watermark" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="mx-auto w-full max-w-5xl overflow-x-auto px-2">
      <ul className="flex gap-1">
        {SECTIONS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="block border-b-2 border-transparent px-3 py-3 text-sm font-medium whitespace-nowrap text-stone-400 hover:text-stone-100 aria-[current=page]:border-accent aria-[current=page]:text-stone-50"
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
