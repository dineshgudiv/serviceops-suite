import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function SituationsLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/situations');
  return children;
}
