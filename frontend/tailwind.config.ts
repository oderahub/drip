import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        drip: {
          bg: "#0a0a0c",
          surface: "#15151a",
          border: "#27272f",
          text: "#e7e7ec",
          muted: "#71717a",
          accent: "#60a5fa",
          active: "#22c55e",
          paused: "#f59e0b",
          danger: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
