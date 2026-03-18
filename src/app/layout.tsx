import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import BackendKeepAlive from "@/components/BackendKeepAlive";

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
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main id="main-scroll" className="flex-1 overflow-auto bg-slate-50">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
