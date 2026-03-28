"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthLayoutProps = {
  children: React.ReactNode;
  navRight?: React.ReactNode;
};

type AuthFormPanelProps = React.HTMLAttributes<HTMLDivElement>;

type AuthPanelHeaderProps = {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
};

type AuthPanelBodyProps = React.HTMLAttributes<HTMLDivElement>;

type AuthErrorBannerProps = {
  children: React.ReactNode;
  className?: string;
};

export const authInputClassName =
  "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-slate-400/25";

export const authNavLinkClassName =
  "text-sm font-medium text-slate-300 underline-offset-4 transition-colors hover:text-white hover:underline";

export function AuthLayout({ children, navRight }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-700/50 bg-slate-900 text-slate-100">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/login" className="block min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white">Contract Finder</h1>
            <p className="text-[10px] text-slate-400">Gov Opportunities</p>
          </Link>
          {navRight ? <div className="flex shrink-0 items-center gap-3">{navRight}</div> : null}
        </div>
      </header>

      <div className="relative flex flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 bg-slate-50" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.45) 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 lg:px-8 lg:py-12">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthFormPanel({ className, children, ...props }: AuthFormPanelProps) {
  return (
    <div
      className={cn(
        "w-full max-w-lg overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AuthPanelHeader({ icon: Icon, title, description }: AuthPanelHeaderProps) {
  return (
    <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-6 py-6 lg:px-8">
      <div className="flex gap-3">
        {Icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0 space-y-1.5 pt-0.5">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 lg:text-2xl">{title}</h2>
          {description ? <p className="text-sm leading-relaxed text-slate-600">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function AuthPanelBody({ className, children, ...props }: AuthPanelBodyProps) {
  return (
    <div className={cn("px-6 py-6 lg:px-8 lg:py-8", className)} {...props}>
      {children}
    </div>
  );
}

export function AuthSectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

export function AuthFieldGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border border-slate-200/80 bg-slate-50/60 p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthErrorBanner({ children, className }: AuthErrorBannerProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800",
        className,
      )}
      role="alert"
    >
      {children}
    </div>
  );
}
