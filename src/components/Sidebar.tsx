"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/sam-gov", label: "Sam.Gov" },
  { href: "/septa", label: "Septa" },
  { href: "/recommendations", label: "Recommendations" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[20%] min-w-[220px] bg-slate-900 text-slate-100 flex flex-col border-r border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Contract Finder
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Gov Opportunities</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current opacity-70" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-700/50">
        <p className="text-xs text-slate-500">© 2025 Contract Finder</p>
      </div>
    </aside>
  );
}
