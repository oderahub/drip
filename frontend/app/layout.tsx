import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drip — Autonomous payment streaming on Somnia",
  description:
    "Token streams whose flow is controlled by on-chain AI agents. Built for the Somnia Agentathon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-drip-bg text-drip-text antialiased">
        {children}
      </body>
    </html>
  );
}
