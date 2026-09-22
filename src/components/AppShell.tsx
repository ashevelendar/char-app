"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCharacters } from "../context/CharacterContext";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { href: "/", label: "Dashboard", icon: "⌂" },
  { href: "/characters", label: "Characters", icon: "♙" },
  { href: "/spells", label: "Spells", icon: "✦" },
  { href: "/inventory", label: "Inventory", icon: "▣" },
  { href: "/features", label: "Features", icon: "◆" },
  { href: "/homebrew", label: "Homebrew", icon: "✚" },
  { href: "/rules", label: "Rules", icon: "◈" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { accessMode, databaseStatus } = useCharacters();
  const { user, signOut } = useAuth();

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="sticky top-0 z-40 border-b border-stone-800/80 bg-stone-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">Campaign Ledger</div>
            <div className="truncate text-lg font-bold text-stone-100">D&D Character Manager</div>
          </Link>

          <div className="flex min-w-0 items-center gap-2">
            <nav className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-stone-800 bg-stone-900/70 p-1">
              {navItems.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${active ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:bg-stone-800 hover:text-stone-100"}`}>
                    <span className="mr-1.5">{item.icon}</span>{item.label}
                  </Link>
                );
              })}
            </nav>
            <Link href="/settings" className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-400 hover:bg-stone-800 hover:text-stone-100" title="Settings">⚙</Link>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pb-2 sm:px-6 lg:px-8">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${accessMode === "dm" ? "border-amber-700/70 bg-amber-950/40 text-amber-300" : "border-stone-800 bg-stone-900 text-stone-500"}`}>
            {accessMode === "dm" ? "DM Mode" : "Player Mode"}
          </span>

          <div className="flex items-center gap-2 text-xs text-stone-600">
            <span className={databaseStatus === "connected" ? "text-emerald-500" : databaseStatus === "error" ? "text-red-400" : "text-stone-500"}>
              {databaseStatus === "connected" ? "● Database connected" : databaseStatus === "error" ? "● Database error" : "● Database loading"}
            </span>
            {user?.email && <span className="hidden sm:inline">{user.email}</span>}
            <button onClick={() => void signOut()} className="rounded-lg border border-stone-800 px-2.5 py-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="mb-8 flex flex-col gap-4 border-b border-stone-800 pb-6 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">{eyebrow}</p>}<h1 className="text-3xl font-bold tracking-tight text-stone-100 sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">{description}</p>}</div>{actions}</header>;
}

export function SectionCard({ title, description, actions, children, className = "" }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-stone-800 bg-stone-900/70 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:p-6 ${className}`}><div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-stone-100">{title}</h2>{description && <p className="mt-1 text-sm text-stone-500">{description}</p>}</div>{actions && <div className="shrink-0">{actions}</div>}</div>{children}</section>;
}

export function StatTile({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4"><div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</div><div className="mt-1 text-2xl font-bold text-stone-100">{value}</div>{subtext && <div className="mt-1 text-xs text-stone-500">{subtext}</div>}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const styles = { neutral: "border-stone-800 bg-stone-950 text-stone-400", good: "border-emerald-900/70 bg-emerald-950/40 text-emerald-400", warn: "border-amber-900/70 bg-amber-950/40 text-amber-300", danger: "border-red-900/70 bg-red-950/30 text-red-400" }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles}`}>{children}</span>;
}
