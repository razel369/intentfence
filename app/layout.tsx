import type { Metadata } from "next";
import "./globals.css";

const socialImage =
  "https://agentpass-protocol.rmalka06.chatgpt.site/intentfence-social.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentpass-protocol.rmalka06.chatgpt.site"),
  title: "IntentFence — Stop unsafe AI-agent actions before execution",
  description:
    "Fail-closed, action-bound authorization for AI agents with five-minute ES256 receipts, MCP risk scanning, and x402 payment safety.",
  keywords: [
    "AI agent payment preflight",
    "AI agent payment firewall",
    "MCP server",
    "A2A agent card",
    "agent policy",
    "AI audit receipts",
    "x402 payments",
    "x402 quote assessment",
    "USDC agent payments",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "IntentFence — Authorize the exact action before your agent executes.",
    description:
      "Bind an exact agent action to explicit policy and verify the short-lived signed receipt before the tool call executes.",
    url: "/",
    siteName: "IntentFence",
    type: "website",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "IntentFence authorizes an exact AI-agent action before execution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IntentFence — Stop unsafe AI-agent actions before execution.",
    description: "Fail-closed action authorization with exact action digests and short-lived signed receipts.",
    images: [socialImage],
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
    "Action-bound authorization, MCP metadata risk scanning, and signed policy receipts for autonomous AI agents through REST and MCP.",
  offers: [
    { "@type": "Offer", name: "Open", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Verified x402", price: "0.005", priceCurrency: "USDC" },
    { "@type": "Offer", name: "x402 quote assessment", price: "0.005", priceCurrency: "USDC" },
    { "@type": "Offer", name: "Paid Integration Pilot", price: "3000", priceCurrency: "USD" },
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
