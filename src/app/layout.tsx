import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BackendKeepAlive from "@/components/BackendKeepAlive";
import RootShell from "@/components/RootShell";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
        <BackendKeepAlive />
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
