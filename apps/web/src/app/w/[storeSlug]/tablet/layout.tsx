import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'TagHere 웨이팅',
  description: '웨이팅 등록 및 관리',
  manifest: '/manifest-waiting.json',
  icons: {
    icon: '/Taghere-logo.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TagHere 웨이팅',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1E3A5F',
};

export default function TabletWaitingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* PWA Meta Tags */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="theme-color" content="#1E3A5F" />

      {/* Screen Orientation */}
      <meta name="screen-orientation" content="landscape" />

      <div className="min-h-screen bg-neutral-100 overflow-hidden">
        {children}
      </div>
    </>
  );
}
