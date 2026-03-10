import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/catalog');
  return children;
}
