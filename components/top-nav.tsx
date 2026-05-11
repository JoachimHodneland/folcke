"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Today" },
  { href: "/stocks", label: "Stocks" },
  { href: "/orders", label: "Orders" },
  { href: "/history", label: "History" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center gap-6">
        <span className="font-semibold text-sm tracking-tight">Folcke</span>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
