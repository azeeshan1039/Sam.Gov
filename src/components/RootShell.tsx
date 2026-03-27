"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { getStoredUser, getUserDisplayName, getUserInitials, type AuthUser } from "@/lib/auth";

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const hideSidebar =
    pathname === "/login" || pathname === "/register" || pathname.startsWith("/invite/");

  useEffect(() => {
    setUser(getStoredUser());
  }, [pathname]);

  if (hideSidebar) {
    return <main className="min-h-screen bg-slate-50">{children}</main>;
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <Sidebar />
      <main
        id="main-scroll"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-50"
      >
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex min-h-16 items-center justify-end px-6 py-3 lg:px-8">
            {user ? (
              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                  <span className="text-sm font-semibold">{getUserInitials(user)}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {getUserDisplayName(user)}
                  </p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <User className="h-4 w-4 text-slate-400" />
              </div>
            ) : null}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
