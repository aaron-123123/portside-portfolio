import type { Metadata } from "next";
import { Space_Mono, Source_Sans_3, Tinos } from "next/font/google";
import Link from "next/link";
import { getRole } from "@/lib/session";
import { RoleToggle } from "@/app/components/RoleToggle";
import "./globals.css";

// Space Mono at weight 400 everywhere — even the 44px hero.
// Loading only 400 keeps the calm, editorial "typewriter" register.
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-space-mono",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-source-sans",
});

// Times-compatible serif for the "Pit Wall" wordmark.
const serif = Tinos({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Pit Wall — Client Delivery Portal",
  description:
    "Client-engagement workspace: private and shared document spaces, approvals, and audit trail.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const role = await getRole();

  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${sourceSans.variable} ${serif.variable}`}
    >
      <body>
        <header className="header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Pit Wall</span>
            <span className="brand-sub">/ Client Delivery</span>
          </Link>
          <RoleToggle role={role} />
        </header>
        {children}
      </body>
    </html>
  );
}
