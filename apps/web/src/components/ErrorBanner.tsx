type Props = {
  status?: number | string;
  message?: string;
  requestId?: string | null;
};

export default function ErrorBanner({ status, message, requestId }: Props) {
  if (!status && !message && !requestId) return null;
  return (
    <div style={{ border: '1px solid #d33', background: '#fff5f5', padding: 12, marginBottom: 12 }}>
      <div><strong>Error</strong></div>
      {status !== undefined && <div>Status: {String(status)}</div>}
      {message && <div>Message: {message}</div>}
      {requestId && <div>Request ID: {requestId}</div>}
    </div>
  );
}
