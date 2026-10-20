/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
};

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'gemini-api',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24, // 24 hours
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /^https:\/\/api\.restful-api\.dev\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'calendar-sync-api',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60, // 1 hour
        },
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

module.exports = withPWA(nextConfig);