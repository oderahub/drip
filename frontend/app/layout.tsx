import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { cn } from "@/lib/utils";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://drip-frontend-psi.vercel.app"),
  title: {
    default: "Drip — autonomous payment streaming on Somnia",
    template: "%s · Drip",
  },
  description:
    "Token streams whose flow is controlled by deterministic on-chain AI. When a contributor stops shipping, the stream pauses itself — no DAO vote, no multisig, no human.",
  keywords: ["Somnia", "Agentic", "Payment Streaming", "DAO", "AI", "On-chain"],
  openGraph: {
    type: "website",
    title: "Drip — autonomous payment streaming on Somnia",
    description:
      "Verified end-to-end on Somnia testnet: 70-second autonomous pause cycle, 3/3 validator unanimity.",
    siteName: "Drip",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drip — autonomous payment streaming",
    description:
      "AI-controlled token streams on Somnia's Agentic L1. Built for the Somnia Agentathon.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#06090d" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(GeistSans.variable, GeistMono.variable)}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
