import { Card } from './Card';
export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return <Card><div className="font-semibold">{title}</div><div className="text-sm opacity-80">{desc}</div></Card>;
}
