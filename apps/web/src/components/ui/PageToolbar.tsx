'use client';
import { Card } from './Card';
import { Input, Select } from './Form';
import { Button } from './Button';

export function PageToolbar({ q, setQ, onRefresh, onExport, filters }: { q: string; setQ: (v: string) => void; onRefresh: () => void; onExport?: () => void; filters?: React.ReactNode }) {
  return (
    <Card className="mb-3 flex items-center gap-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-72" />
      {filters ?? <Select><option>All</option></Select>}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onRefresh}>Refresh</Button>
        {onExport && <Button variant="ghost" onClick={onExport}>Export CSV</Button>}
      </div>
    </Card>
  );
}
