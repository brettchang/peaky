/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/*": [
        "./node_modules/@googleworkspace/cli/**/*",
        "./node_modules/.bin/gws",
      ],
    },
  },
};

export default nextConfig;
