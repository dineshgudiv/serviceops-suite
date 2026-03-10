import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/integrations');
  return children;
}
