/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@zenith/aios-sdk',
    '@zenith/aios-context',
    '@zenith/aios-memory',
    '@zenith/aios-agents',
    '@zenith/aios-tools',
    '@zenith/aios-workflows',
    '@zenith/aios-knowledge',
    '@zenith/aios-policy',
    '@zenith/aios-security',
    '@zenith/aios-observability',
    '@zenith/aios-plugins',
    '@zenith/aios-audit',
  ],
  experimental: { serverComponentsExternalPackages: [] },
};

module.exports = nextConfig;
