"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { setStoredUser } from "@/lib/auth";

interface InvitePayload {
  email: string;
  invite_path: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [naicsCodes, setNaicsCodes] = useState("");

  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminTitle, setAdminTitle] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [inviteEmails, setInviteEmails] = useState(["", "", "", "", ""]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [createdInvites, setCreatedInvites] = useState<InvitePayload[]>([]);

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setCreatedInvites([]);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const teamInviteEmails = inviteEmails.map((email) => email.trim()).filter(Boolean);
    if (teamInviteEmails.length > 5) {
      setError("You can only invite up to 5 team members");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/backend/auth/register-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          company: {
            legal_name: companyName,
          },
          industry,
          website,
          address,
          naics_codes: naicsCodes,
          admin_first_name: adminFirstName,
          admin_last_name: adminLastName,
          admin: {
            email: adminEmail,
            password,
            full_name: `${adminFirstName} ${adminLastName}`.trim(),
          },
          admin_title: adminTitle,
          admin_phone: adminPhone,
          admin_email: adminEmail,
          admin_password: password,
          team_invite_emails: teamInviteEmails,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      setStoredUser(data.user);
      setRegistered(true);
      setCreatedInvites((data.invites || []) as InvitePayload[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Company Registered</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">Your company is registered and your account is ready.</p>
            {createdInvites.length > 0 && (
              <div className="space-y-2">
                {createdInvites.map((invite) => (
                  <div key={invite.email} className="rounded border bg-slate-50 p-3 text-sm">
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-slate-600 break-all">{`${baseUrl}${invite.invite_path}`}</p>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={() => router.push("/")} className="w-full">
              Continue to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Register Your Company</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={onSubmit}>
              <section className="space-y-3">
                <h2 className="font-semibold">Company Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="naics_codes">NAICS Codes (comma separated)</Label>
                    <Input id="naics_codes" value={naicsCodes} onChange={(e) => setNaicsCodes(e.target.value)} placeholder="541512, 541519" />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="font-semibold">Admin Account</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="admin_first_name">First Name</Label>
                    <Input id="admin_first_name" value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin_last_name">Last Name</Label>
                    <Input id="admin_last_name" value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin_title">Title</Label>
                    <Input id="admin_title" value={adminTitle} onChange={(e) => setAdminTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin_phone">Phone</Label>
                    <Input id="admin_phone" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="admin_email">Email</Label>
                    <Input id="admin_email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirm Password</Label>
                    <Input id="confirm_password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="font-semibold">Invite Team Members (up to 5)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {inviteEmails.map((email, index) => (
                    <div className="space-y-2" key={`invite-${index}`}>
                      <Label htmlFor={`invite_email_${index}`}>Team Email {index + 1}</Label>
                      <Input
                        id={`invite_email_${index}`}
                        type="email"
                        value={email}
                        onChange={(e) => {
                          const next = [...inviteEmails];
                          next[index] = e.target.value;
                          setInviteEmails(next);
                        }}
                        placeholder="member@company.com"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Registering..." : "Register Company"}
              </Button>
            </form>
            <p className="text-sm text-slate-600 mt-4">
              Already registered?{" "}
              <Link href="/login" className="text-blue-600 hover:underline">
                Login here
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
