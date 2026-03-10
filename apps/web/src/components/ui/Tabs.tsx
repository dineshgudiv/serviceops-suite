export function Tabs({ items }: { items: { label: string; href: string; badge?: number }[] }) {
  return <nav className="so-tabs">{items.map(i => <a key={i.href} href={i.href}>{i.label}{typeof i.badge === 'number' ? ` (${i.badge})` : ''}</a>)}</nav>;
}
