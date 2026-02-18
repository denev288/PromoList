"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/my-list", label: "My List" },
  { href: "/deals", label: "Deals" },
] as const;

function linkClass(isActive: boolean): string {
  if (isActive) {
    return "rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white";
  }

  return "rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-muted transition hover:border-accent hover:text-ink";
}

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link key={item.href} href={item.href} className={linkClass(isActive)}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
