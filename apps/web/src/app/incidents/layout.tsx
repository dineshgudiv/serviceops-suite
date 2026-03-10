import { requireConsoleAccess } from '../../lib/auth/dal';

export default async function IncidentsLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleAccess('/incidents');
  return children;
}
