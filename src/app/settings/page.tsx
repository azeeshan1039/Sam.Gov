"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { GmailConnectionCard } from "@/components/emails/GmailConnectionCard";
import { DeliverabilitySettingsCard } from "@/components/emails/DeliverabilitySettingsCard";
import { HeldEmailsCard } from "@/components/emails/HeldEmailsCard";

function SettingsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) router.replace("/register");
    else setUser(current);
  }, [router]);

  if (!user) return null;
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-600">Email account and sending settings.</p>
      </div>
      <GmailConnectionCard callbackResult={params.get("gmail")} callbackMessage={params.get("message")} />
      {user.role === "admin" && (
        <>
          <HeldEmailsCard />
          <DeliverabilitySettingsCard />
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={null}><SettingsContent /></Suspense>;
}
