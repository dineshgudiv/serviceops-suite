import { Badge } from './Badge';
export function StatusBadge({ value }: { value?: string }) { return <Badge>{value ?? 'UNKNOWN'}</Badge>; }
export function PriorityBadge({ value }: { value?: string }) { return <Badge className={value === 'P1' ? 'bg-red-500/20 text-red-300' : ''}>{value ?? 'P3'}</Badge>; }
export function SlaBadge({ breached }: { breached?: boolean }) { return <Badge className={breached ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}>{breached ? 'BREACHING' : 'OK'}</Badge>; }
