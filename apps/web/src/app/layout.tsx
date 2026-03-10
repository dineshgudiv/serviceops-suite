import './globals.css';
import AppFrame from '../components/AppFrame';
import { createThemeBootstrapScript } from '../lib/theme';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fraud Ops Risk Console',
  description: 'Fraud Analytics + Case Investigation + Report Generation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: createThemeBootstrapScript() }} />
      </head>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
