/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @reachinbox/shared ships TypeScript source, so Next compiles it inline.
  transpilePackages: ['@reachinbox/shared'],
};

export default nextConfig;
