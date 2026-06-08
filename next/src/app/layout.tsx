import type { Metadata, Viewport } from 'next';
import { Comfortaa } from 'next/font/google';
import { AuthProvider } from '@/hooks/useAuth';
import { SetupNotice } from '@/components/SetupNotice';
import { ThemeApplier } from '@/components/ThemeApplier';
import './globals.css';

const comfortaa = Comfortaa({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vellara Messenger',
  description: 'Vellara — мессенджер на Next.js + Supabase',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Vellara',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#c9a885',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="gold-dark">
      <body className={comfortaa.className}>
        <SetupNotice />
        <AuthProvider>
          <ThemeApplier />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
