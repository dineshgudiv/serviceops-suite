import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/knowledge');
  return children;
}
