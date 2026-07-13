import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentPass — The preflight layer for autonomous AI",
  description:
    "A machine-readable handshake for agent identity, scope, cost, data rules, and human approval.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "AgentPass — Before an agent acts, it checks in.",
    description:
      "One machine-readable handshake for identity, scope, cost, data rules, and human approval.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
