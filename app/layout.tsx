import type { Metadata } from "next";
import "./globals.css";

const socialImage =
  "https://agentpass-protocol.rmalka06.chatgpt.site/intentfence-social.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentpass-protocol.rmalka06.chatgpt.site"),
  title: "IntentFence — Verify x402 quotes before agents pay",
  description:
    "Caller-observed x402 quote assessment for AI agents: verify the Base USDC asset, price, payee, and resource binding before payment.",
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
    title: "IntentFence — Verify an x402 quote before your agent pays.",
    description:
      "Check an observed x402 quote against a caller-approved payment policy and sign the result — without contacting the target.",
    url: "/",
    siteName: "IntentFence",
    type: "website",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "IntentFence verifies an x402 quote before an AI agent signs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IntentFence — Verify x402 quotes before agents pay.",
    description: "Signed assessment of an exact caller-observed x402 quote, payee, asset, price, and resource binding.",
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
    "Caller-observed x402 quote assessments and signed payment-policy receipts for autonomous AI agents, available through REST and paid MCP.",
  offers: [
    { "@type": "Offer", name: "Open", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Verified x402", price: "0.005", priceCurrency: "USDC" },
    { "@type": "Offer", name: "x402 quote assessment", price: "0.005", priceCurrency: "USDC" },
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
