"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";

import { somniaTestnet, somniaMainnet } from "@/lib/chains";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chain state polling — refetch on focus is too aggressive for our
      // demo. We'll set tighter staleTimes per-query where it matters.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// RainbowKit requires a WalletConnect Cloud project ID. If one isn't set
// we use a placeholder string — MetaMask + injected wallets still work,
// but WalletConnect's QR-code mobile flow will degrade. For the demo,
// set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your Vercel env to enable.
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "drip-demo-placeholder";

const wagmiConfig = getDefaultConfig({
  appName: "Drip",
  projectId: WC_PROJECT_ID,
  chains: [somniaTestnet, somniaMainnet],
  transports: {
    [somniaTestnet.id]: http(),
    [somniaMainnet.id]: http(),
  },
  ssr: true,
});

function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * Wraps the entire app with:
 *   - Theme (next-themes, controls .dark class on <html>)
 *   - Wagmi (chain config, accounts, providers)
 *   - React Query (Wagmi's required peer, also for our own data)
 *   - RainbowKit (the wallet connect modal UI, themed to match Drip)
 *   - Sonner toaster (rendered once at root for global toasts)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            modalSize="compact"
            initialChain={somniaTestnet}
            theme={{
              lightMode: lightTheme({
                accentColor: "hsl(158 79% 30%)", // Drip emerald
                accentColorForeground: "hsl(150 67% 96%)",
                borderRadius: "large",
                fontStack: "system",
                overlayBlur: "small",
              }),
              darkMode: darkTheme({
                accentColor: "hsl(158 64% 40%)",
                accentColorForeground: "hsl(215 36% 4%)",
                borderRadius: "large",
                fontStack: "system",
                overlayBlur: "small",
              }),
            }}
          >
            {children}
            <Toaster
              position="bottom-right"
              theme="system"
              richColors
              closeButton
              toastOptions={{
                classNames: {
                  toast:
                    "rounded-2xl border-border shadow-lg backdrop-blur",
                },
              }}
            />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
