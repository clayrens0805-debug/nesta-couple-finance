import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NESTA — Separate Money. Shared Life.',
  description:
    'Platform keuangan pasangan & keluarga untuk mengelola pengeluaran bersama, kas bersama, anggaran, tagihan, dan target tabungan tanpa menggabungkan rekening pribadi.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased bg-[#F7F6F2] text-[#101D2B]">{children}</body>
    </html>
  );
}
