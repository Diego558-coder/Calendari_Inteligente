/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // web-push usa módulos nativos de Node: que no se empaquete en las funciones del servidor
  serverExternalPackages: ['web-push'],
  async headers() {
    return [
      {
        // El service worker debe revisarse en cada visita para que las actualizaciones lleguen enseguida
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ];
  },
};

module.exports = nextConfig;
