import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Drip extensions beyond shadcn defaults
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        // Dark-section surfaces for the "moment" callouts (arcpay pattern)
        surface: {
          dark: "hsl(var(--surface-dark))",
          "dark-foreground": "hsl(var(--surface-dark-foreground))",
        },
        // Stream / verdict / action state colours.
        // Usage: `text-state-paused bg-state-paused-bg` for the pill,
        // `bg-state-paused/10` for a translucent tint on a card.
        // See docs/UI_DESIGN_DECISIONS.md for the palette rationale.
        "state-paused": {
          DEFAULT: "hsl(var(--state-paused))",
          bg: "hsl(var(--state-paused-bg))",
        },
        "state-inconclusive": {
          DEFAULT: "hsl(var(--state-inconclusive))",
          bg: "hsl(var(--state-inconclusive-bg))",
        },
        "state-completed": {
          DEFAULT: "hsl(var(--state-completed))",
          bg: "hsl(var(--state-completed-bg))",
        },
        "state-cancelled": {
          DEFAULT: "hsl(var(--state-cancelled))",
          bg: "hsl(var(--state-cancelled-bg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        // The arcpay pillow-soft sizes
        "2xl": "calc(var(--radius) + 2px)",
        "3xl": "calc(var(--radius) + 10px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontFeatureSettings: {
        // Tabular numerals for numeric displays — used via `font-numeric` util.
        numeric: '"tnum", "lnum"',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // For pulse rings on "currently streaming" indicators
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.55" },
          "80%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
        // Smooth shimmer for skeleton loaders
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.215, 0.610, 0.355, 1.000) infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      backgroundImage: {
        // Subtle grain texture overlay (used very sparingly on dark sections)
        grain:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
