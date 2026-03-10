'use client';
import { usePathname } from 'next/navigation';
import AppShell from './AppShell';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicPaths = ['/login', '/signup', '/forbidden', '/accept-invite', '/forgot-password', '/reset-password', '/verify-email'];
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return <>{children}</>;
  if (pathname === '/portal' || pathname.startsWith('/portal/')) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
