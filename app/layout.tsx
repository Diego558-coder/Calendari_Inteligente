import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MiHorario IA | Calendario Inteligente (Universidad + Trabajo)',
  description: 'Organiza tu horario universitario y de trabajo escaneando fotos con IA gratuita. Detecta tus horas libres y recibe avisos en tu celular antes de cada clase.',
  manifest: '/manifest.json',
  applicationName: 'MiHorario IA',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Necesario para que en iPhone se abra como app (y así pueda recibir notificaciones push)
  appleWebApp: {
    capable: true,
    title: 'MiHorario',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(err) {
                    console.warn('No se pudo registrar el service worker:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
