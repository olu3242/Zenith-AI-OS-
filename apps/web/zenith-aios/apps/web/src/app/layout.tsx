import type { Metadata } from 'next';
import { Inter, Space_Mono } from 'next/font/google';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Zenith AI OS',
  description: 'Multi-tenant AI Operating System — Reusable, Auditable, Open-Standard Ready',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceMono.variable}`}>
      <body className="min-h-screen bg-[#0A0B0E] text-[#E8E8E8] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
