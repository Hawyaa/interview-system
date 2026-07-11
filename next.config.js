/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow face-api.js model files to be served from /public
  // Disable strict mode to avoid double-render issues with webcam
  reactStrictMode: false,

  // Webpack config to handle face-api.js canvas dependency in browser
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        canvas: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
