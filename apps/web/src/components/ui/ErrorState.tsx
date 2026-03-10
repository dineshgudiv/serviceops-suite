import { Button } from './Button';
import { errorTitle } from '../../lib/errors';

export function ErrorState({ code, message, requestId, onRetry, details }: { code: string; message: string; requestId?: string | null; onRetry?: () => void; details?: unknown }) {
  const copy = () => navigator.clipboard.writeText(JSON.stringify({ code, message, request_id: requestId, details }, null, 2));
  return (
    <div className="so-error">
      <div className="font-semibold">{errorTitle(code)}</div>
      <div className="text-sm opacity-90">{message}</div>
      <div className="text-xs opacity-75">code: {code} | request_id: {requestId ?? 'n/a'}</div>
      <div className="mt-2 flex gap-2">
        <Button variant="ghost" onClick={copy}>Copy details</Button>
        {onRetry && <Button onClick={onRetry}>Retry</Button>}
      </div>
    </div>
  );
}
