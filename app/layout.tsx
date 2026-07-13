import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentpass-protocol.rmalka06.chatgpt.site"),
  title: "AgentPass — Preflight infrastructure for AI agents",
  description:
    "A callable REST, MCP, and A2A preflight layer for agent identity, scope, cost, data rules, and human approval.",
  keywords: [
    "AI agent authorization",
    "agent preflight",
    "MCP server",
    "A2A agent card",
    "agent policy",
    "AI audit receipts",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "AgentPass — Before an agent acts, it checks in.",
    description:
      "One callable preflight for identity, scope, cost, data rules, and human approval — via REST, MCP, and A2A.",
    url: "/",
    siteName: "AgentPass",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "AgentPass — Before an agent acts, it checks in.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentPass — Before an agent acts, it checks in.",
    description: "REST, MCP, and A2A preflight infrastructure for autonomous agents.",
    images: ["/og.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AgentPass",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: "https://agentpass-protocol.rmalka06.chatgpt.site/",
  description:
    "Preflight infrastructure for autonomous AI actions, available through REST, MCP, and A2A.",
  offers: [
    { "@type": "Offer", name: "Open", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Builder", price: "49", priceCurrency: "USD" },
    { "@type": "Offer", name: "Scale", price: "249", priceCurrency: "USD" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
