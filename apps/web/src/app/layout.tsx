import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: '태그히어 CRM',
  description: '매장 고객 관리 및 포인트 적립 시스템',
  manifest: '/manifest.json',
  icons: {
    icon: '/Taghere-logo.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '태그히어 CRM',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const GA_ID = 'G-ZPYVXVK1GJ'
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || ''

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        {/* 카카오 JavaScript SDK */}
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
          integrity="sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Ber2S5D"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
        <Script id="kakao-init" strategy="afterInteractive">
          {`
            if (typeof window !== 'undefined' && window.Kakao && !window.Kakao.isInitialized() && '${KAKAO_JS_KEY}') {
              window.Kakao.init('${KAKAO_JS_KEY}');
            }
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
