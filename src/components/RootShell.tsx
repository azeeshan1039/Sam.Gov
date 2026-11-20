"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Search, X } from "lucide-react";
import { AgentAlertsProvider } from "@/components/notifications/AgentAlertsProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import { clearStoredUser, getStoredUser, getUserDisplayName, getUserInitials, type AuthUser } from "@/lib/auth";

const AGENT_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/my-bids", label: "My bids" },
  { href: "/award-tracking", label: "Award tracking" },
  { href: "/agent-bid-data", label: "Reports" },
];

const ADMIN_NAV = [
  ...AGENT_NAV.filter((item) => item.href !== "/my-bids"),
  { href: "/work-management", label: "Admin" },
];

const SHARED_LINKS = [
  { href: "/contract-awards", label: "Contract awards" },
  { href: "/negotiations", label: "Negotiations" },
  { href: "/niche-directory", label: "Niche directory" },
  { href: "/weekly-submissions", label: "Weekly submissions" },
  { href: "/settings", label: "Settings" },
];

const MANAGER_LINKS = [
  { href: "/hundred-k", label: "$100K+ by employee" },
  { href: "/approvals", label: "Approvals" },
  { href: "/bid-history", label: "Bid history & pipeline" },
  { href: "/activity-log", label: "Activity log" },
  { href: "/stats", label: "Stats" },
  { href: "/team", label: "Team" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const hideShell =
    pathname === "/login" || pathname === "/register" || pathname.startsWith("/invite/");

  useEffect(() => {
    setUser(getStoredUser());
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  if (hideShell) {
    return <main className="min-h-screen bg-white">{children}</main>;
  }

  const items = user?.role === "admin" ? ADMIN_NAV : AGENT_NAV;
  const destinations = [...items, ...SHARED_LINKS, ...(user?.role === "admin" ? MANAGER_LINKS : [])];
  const showSearch = pathname === "/" && user?.role === "admin";

  const signOut = async () => {
    await fetch("/api/backend/auth/logout", { method: "POST" }).catch(() => undefined);
    clearStoredUser();
    router.replace("/login");
  };

  return (
    <AgentAlertsProvider user={user}>
      <div className="flex min-h-screen flex-col bg-white">
        <header className="cf-hdr sticky top-0 z-20">
          <div className="cf-wrap cf-hdr-in">
            <Link className="cf-logo" href="/">
              <span className="cf-logo-mark" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
                  <path d="M14 3v5h5" />
                  <path d="M8 9h3M8 13h6" />
                  <circle cx="17" cy="17" r="3" />
                  <path d="m21 21-1.8-1.8" />
                </svg>
              </span>
              <span>
                <span className="cf-logo-name">Contract Finder</span>
                <span className="cf-logo-tag">GOV OPPORTUNITIES</span>
              </span>
            </Link>
            <nav className="cf-navs cf-navs-desktop" aria-label="Primary">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const inAdmin = item.href === "/work-management" && MANAGER_LINKS.some(({ href }) => isActive(pathname, href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`cf-nav${active || inAdmin ? " cf-nav-on" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="cf-hdr-right">
              <button
                type="button"
                className="cf-icon-btn"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                onClick={() => { setMenuOpen((open) => !open); setAccountOpen(false); }}
              >
                {menuOpen ? <X size={20} strokeWidth={1.75} /> : <Menu size={20} strokeWidth={1.75} />}
              </button>
              {showSearch ? (
                <Link className="cf-icon-btn" href="/opportunities" aria-label="Search">
                  <Search size={20} strokeWidth={1.75} />
                </Link>
              ) : null}
              {user ? <NotificationBell /> : (
                <span className="cf-icon-btn" aria-hidden>
                  <Bell size={20} strokeWidth={1.75} />
                </span>
              )}
              {user ? (
                <div style={{ position: "relative" }}>
                  <button type="button" className="cf-me" aria-label={getUserDisplayName(user)} aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen((open) => !open)}>
                    <span className="cf-av cf-av-me">{getUserInitials(user)}</span>
                    <span>
                      <span className="cf-me-n">{getUserDisplayName(user)}</span>
                      <span className="cf-me-r">{user.role === "admin" ? "Manager" : "Agent"}</span>
                    </span>
                  </button>
                  {accountOpen ? (
                    <div className="cf-menu" role="menu">
                      <Link href="/settings" role="menuitem">Settings</Link>
                      <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {menuOpen ? (
            <nav className="cf-all-destinations cf-wrap" aria-label="All pages">
              {destinations.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`cf-nav${isActive(pathname, item.href) ? " cf-nav-on" : ""}`}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>
        <div style={{ flex: 1 }}>{children}</div>
        <footer className="cf-foot">
          <div className="cf-wrap cf-foot-in">
            <span>© 2026 Contract Finder</span>
            <span>All times ET</span>
          </div>
        </footer>
      </div>
    </AgentAlertsProvider>
  );
}
