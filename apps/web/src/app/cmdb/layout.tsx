import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function CmdbLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/cmdb');
  return children;
}
