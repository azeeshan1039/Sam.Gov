import type { Metadata } from "next";
import "./globals.css";
import BackendKeepAlive from "@/components/BackendKeepAlive";
import RootShell from "@/components/RootShell";

export const metadata: Metadata = {
  title: "Contract Finder - Gov Opportunities Dashboard",
  description: "Dashboard for finding and tracking government contract opportunities",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BackendKeepAlive />
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
