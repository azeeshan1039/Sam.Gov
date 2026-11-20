"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBand, PageMain } from "@/components/design/PageFrame";
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
    <>
      <PageBand title="Settings" lead="Manage your email account and sending settings." />
      <PageMain className="cf-workspace">
      <GmailConnectionCard callbackResult={params.get("gmail")} callbackMessage={params.get("message")} />
      {user.role === "admin" && (
        <>
          <HeldEmailsCard />
          <DeliverabilitySettingsCard />
        </>
      )}
      </PageMain>
    </>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={null}><SettingsContent /></Suspense>;
}
