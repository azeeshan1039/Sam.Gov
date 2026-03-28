"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import {
  AuthLayout,
  AuthFormPanel,
  AuthPanelHeader,
  AuthPanelBody,
  AuthErrorBanner,
  authInputClassName,
  authNavLinkClassName,
} from "@/components/AuthLayout";
import { setStoredUser } from "@/lib/auth";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const [preview, setPreview] = useState<{ email: string; company_name: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("Invalid invite link.");
      setLoadingPreview(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/backend/auth/team/invite/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLoadError(data.error || "This invite is not valid.");
          return;
        }
        setPreview({ email: data.email, company_name: data.company_name });
      } catch {
        setLoadError("Could not load invite.");
      } finally {
        setLoadingPreview(false);
      }
    })();
  }, [token]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirmPassword") || "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    const payload = {
      full_name: String(fd.get("full_name") || "").trim(),
      job_title: String(fd.get("job_title") || "").trim(),
      password,
    };

    setSubmitting(true);
    try {
      const res = await fetch(`/api/backend/auth/team/accept/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not complete registration.");
        return;
      }
      setStoredUser(data.user);
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPreview) {
    return (
      <AuthLayout
        navRight={
          <Link href="/login" className={authNavLinkClassName}>
            Sign in
          </Link>
        }
      >
        <AuthFormPanel className="max-w-lg">
          <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-8 py-6">
            <div className="h-8 w-56 animate-pulse rounded-md bg-slate-200" />
            <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-slate-100" />
          </div>
          <div className="space-y-4 px-8 py-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        </AuthFormPanel>
      </AuthLayout>
    );
  }

  if (loadError || !preview) {
    return (
      <AuthLayout
        navRight={
          <Link href="/login" className={authNavLinkClassName}>
            Sign in
          </Link>
        }
      >
        <AuthFormPanel className="max-w-md">
          <AuthPanelHeader title="Invite unavailable" />
          <AuthPanelBody className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">
              {loadError || "This invite link is invalid or has already been used."}
            </p>
            <Button asChild variant="outline" className="border-slate-200">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </AuthPanelBody>
        </AuthFormPanel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      navRight={
        <Link href="/login" className={authNavLinkClassName}>
          Sign in
        </Link>
      }
    >
      <AuthFormPanel className="max-w-lg">
        <AuthPanelHeader
          icon={UserPlus}
          title={`Join ${preview.company_name}`}
          description="Complete your profile to access the team workspace. Your email is fixed from the invite."
        />
        <AuthPanelBody>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-700">Email</Label>
              <Input
                value={preview.email}
                disabled
                readOnly
                className="border-slate-200 bg-slate-100 text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-slate-700">
                Full name
              </Label>
              <Input
                id="full_name"
                name="full_name"
                required
                autoComplete="name"
                className={authInputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title" className="text-slate-700">
                Job title (optional)
              </Label>
              <Input
                id="job_title"
                name="job_title"
                autoComplete="organization-title"
                className={authInputClassName}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700">
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={authInputClassName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-700">
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={authInputClassName}
                />
              </div>
            </div>
            {error ? <AuthErrorBanner>{error}</AuthErrorBanner> : null}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account & sign in"}
            </Button>
            <p className="text-center text-sm text-slate-600">
              Wrong person?{" "}
              <Link
                href="/login"
                className="font-semibold text-slate-900 underline-offset-4 hover:underline"
              >
                Sign in with a different account
              </Link>
            </p>
          </form>
        </AuthPanelBody>
      </AuthFormPanel>
    </AuthLayout>
  );
}
