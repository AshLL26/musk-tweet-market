import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Musk Tweet Market',
  description: 'Prediction market dashboard for Elon Musk tweet count intervals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0b1020', color: '#e5e7eb' }}>
        {children}
      </body>
    </html>
  );
}
