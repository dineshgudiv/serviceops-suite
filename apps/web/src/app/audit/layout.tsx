import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/audit');
  return children;
}
