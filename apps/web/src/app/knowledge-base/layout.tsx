import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function KnowledgeBaseLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/knowledge-base');
  return children;
}
