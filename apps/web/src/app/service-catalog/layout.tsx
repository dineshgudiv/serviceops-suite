import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function ServiceCatalogLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/service-catalog');
  return children;
}
