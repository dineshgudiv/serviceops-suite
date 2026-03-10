import RequesterPortalShell from '../../components/portal/RequesterPortalShell';
import { requirePortalAccess } from '../../lib/auth/dal';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess('/portal');
  return <RequesterPortalShell>{children}</RequesterPortalShell>;
}
