/** @type {import('next').NextConfig} */
const webpack = require("webpack");

const nextConfig = {
  reactStrictMode: true,
  // Silence noisy "module not found" warnings emitted by WalletConnect's
  // logger (`pino-pretty`) and MetaMask SDK's React-Native polyfill —
  // both are optional peers we never reach in browser builds.
  webpack: (config) => {
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp:
          /^(pino-pretty|lokijs|encoding|@react-native-async-storage\/async-storage)$/,
      }),
    );
    return config;
  },
  // Lint locally / in CI; don't block production builds on it.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
