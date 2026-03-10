import { requireRole } from '../../lib/auth/dal';

export default async function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole('ADMIN');
  return children;
}
