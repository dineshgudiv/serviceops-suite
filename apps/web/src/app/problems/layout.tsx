import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function ProblemsLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/problems');
  return children;
}
