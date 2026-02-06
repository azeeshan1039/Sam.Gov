"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/sam-gov", label: "Sam.Gov" },
  { href: "/negotiations", label: "Negotiations" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const renderNav = () => (
    <>
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
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base md:text-sm font-medium transition-colors ${
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
    </>
  );

  return (
    <>
      {/* Desktop sidebar (unchanged layout) */}
      <aside className="hidden md:flex w-[20%] min-w-[220px] bg-slate-900 text-slate-100 flex-col border-r border-slate-700/50">
        {renderNav()}
      </aside>

      {/* Mobile header + drawer */}
      <div className="relative w-0 md:hidden">
        {/* Mobile top bar with large hamburger */}
        <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 shadow md:px-6">
          <div>
            <p className="text-base font-semibold text-white leading-tight">
              Contract Finder
            </p>
            <p className="text-[11px] text-slate-400">Gov Opportunities</p>
          </div>
          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-800/80 text-slate-100 shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            <span className="sr-only">
              {mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            </span>
            <div className="flex flex-col items-center justify-center gap-1.5">
              <span
                className={`h-0.5 w-6 rounded-full bg-current transition-transform duration-200 ${
                  mobileOpen ? "translate-y-1.5 rotate-45" : ""
                }`}
              />
              <span
                className={`h-0.5 w-6 rounded-full bg-current transition-opacity duration-200 ${
                  mobileOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`h-0.5 w-6 rounded-full bg-current transition-transform duration-200 ${
                  mobileOpen ? "-translate-y-1.5 -rotate-45" : ""
                }`}
              />
            </div>
          </button>
        </div>

        {/* Mobile overlay + drawer */}
        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu overlay"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[80%] flex-col border-r border-slate-700/50 bg-slate-900 text-slate-100 shadow-xl transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderNav()}
        </aside>
      </div>
    </>
  );
}
