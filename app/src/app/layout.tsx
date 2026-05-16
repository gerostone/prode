import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prode Mundial 2026',
  description: 'Pronóstico deportivo del Mundial 2026',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
