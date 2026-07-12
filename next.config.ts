import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Silence "Module not found" warnings for optional Privy peer dependencies
    // that this app does not use (Farcaster mini-app / Stripe crypto).
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
      "@stripe/crypto": false,
    };
    return config;
  },
};

export default nextConfig;
