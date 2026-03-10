import { requireRole } from '../../lib/auth/dal';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole('ADMIN');
  return children;
}
