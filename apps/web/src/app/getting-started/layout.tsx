import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function GettingStartedLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/getting-started');
  return children;
}
