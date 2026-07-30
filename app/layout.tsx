import type { Metadata } from "next";
import "./globals.css";

const socialImage =
  "https://agentpass-protocol.rmalka06.chatgpt.site/og.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentpass-protocol.rmalka06.chatgpt.site"),
  title: "IntentFence — Screen every Base recipient before your agent pays",
  description:
    "One budget-capped x402 call screens a Base recipient for 0.002 USDC and returns a fail-closed signed result before your agent pays.",
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
    title: "IntentFence — Screen every Base recipient before your agent pays.",
    description:
      "A repeatable 0.002 USDC wallet-risk check for autonomous agents, exposed through REST, MCP, and Coinbase Agentic Wallet.",
    url: "/",
    siteName: "IntentFence",
    type: "website",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "IntentFence screens a Base recipient before an AI agent pays",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IntentFence — Screen every Base recipient before your agent pays.",
    description:
      "A budget-capped 0.002 USDC x402 wallet-risk check with a fail-closed signed result.",
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
    { "@type": "Offer", name: "Base wallet risk screen", price: "0.002", priceCurrency: "USDC" },
    { "@type": "Offer", name: "Verified x402", price: "0.005", priceCurrency: "USDC" },
    { "@type": "Offer", name: "x402 quote assessment", price: "0.005", priceCurrency: "USDC" },
    { "@type": "Offer", name: "Production Policy Pack", price: "1", priceCurrency: "USDC" },
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
