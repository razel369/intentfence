import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentpass-protocol.rmalka06.chatgpt.site"),
  title: "IntentFence — Payment firewall for AI agents",
  description:
    "A REST, paid MCP, and x402 preflight gate for agent spend, scope, data rules, and approval markers.",
  keywords: [
    "AI agent payment preflight",
    "AI agent payment firewall",
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
    title: "IntentFence — Add a fail-closed preflight before each agent payment.",
    description:
      "A live preflight and paid x402 audit receipt for autonomous-agent payments — via REST and MCP.",
    url: "/",
    siteName: "IntentFence",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "IntentFence — Payment firewall for AI agents.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IntentFence — Payment firewall for AI agents.",
    description: "REST, paid MCP, and x402 preflight infrastructure for autonomous-agent payments.",
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
    "Payment preflight and signed audit-receipt infrastructure for autonomous AI agents, available through REST and paid MCP.",
  offers: [
    { "@type": "Offer", name: "Open", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Verified x402", price: "0.005", priceCurrency: "USDC" },
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
