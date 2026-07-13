import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentpass-protocol.rmalka06.chatgpt.site"),
  title: "IntentFence — Spend and action policy for AI agents",
  description:
    "An enforceable REST, MCP, and A2A policy gate for agent spend, scope, data rules, and human approval.",
  keywords: [
    "AI agent authorization",
    "agent policy gateway",
    "MCP server",
    "A2A agent card",
    "agent policy",
    "AI audit receipts",
    "x402 payments",
    "USDC agent payments",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "IntentFence — Stop unsafe agent actions before they execute.",
    description:
      "One enforceable gate for spend, scope, data rules, and human approval — via REST, MCP, and A2A.",
    url: "/",
    siteName: "IntentFence",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "IntentFence — Stop unsafe agent actions before they execute.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IntentFence — Stop unsafe agent actions before they execute.",
    description: "REST, MCP, and A2A spend-policy infrastructure for autonomous agents.",
    images: ["/og.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IntentFence",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: "https://agentpass-protocol.rmalka06.chatgpt.site/",
  description:
    "Spend and action policy infrastructure for autonomous AI, available through REST, MCP, and A2A.",
  offers: [
    { "@type": "Offer", name: "Open", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Verified x402", price: "0.05", priceCurrency: "USDC" },
    { "@type": "Offer", name: "Launch Pilot", price: "750", priceCurrency: "USD" },
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
