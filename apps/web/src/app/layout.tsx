import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zenith AI OS',
  description: 'The infrastructure layer between your product and AI capabilities',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
