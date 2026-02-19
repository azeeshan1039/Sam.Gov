"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, Handshake, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sam-gov", label: "Sam.Gov", icon: Globe },
  { href: "/negotiations", label: "Negotiations", icon: Handshake },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-56"
      } h-screen shrink-0 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-700/50 transition-all duration-300 ease-in-out`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 flex items-center gap-3 min-h-[64px]">
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              Contract Finder
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Gov Opportunities</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-2 py-3" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-slate-700/70 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle + footer */}
      <div className="p-2 border-t border-slate-700/50 space-y-2">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center justify-center w-full gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Collapse</span>
            </>
          )}
        </button>
        {!collapsed && (
          <p className="text-[10px] text-slate-500 text-center">© 2025 Contract Finder</p>
        )}
      </div>
    </aside>
  );
}
