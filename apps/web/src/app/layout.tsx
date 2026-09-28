import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ECO-SHIELD — Smart Hazard Intelligence & Environmental Local Detection', template: '%s · ECO-SHIELD' },
  description: 'AI-powered multi-hazard environmental monitoring and early-warning platform. Demonstration build with simulated data.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f2140' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
