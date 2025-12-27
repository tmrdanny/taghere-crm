import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '태그히어 CRM',
  description: '매장 고객 관리 및 포인트 적립 시스템',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
