import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function ChangesLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/changes');
  return children;
}
