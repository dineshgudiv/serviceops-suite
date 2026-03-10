export default function NotConfigured({ title, endpoint }: { title: string; endpoint?: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <div style={{ border: '1px solid #ddd', padding: 12, background: '#fff' }}>
        <div><strong>Not configured</strong></div>
        {endpoint && <div>Endpoint: {endpoint}</div>}
        <div>Configure the backend service and route through /api/bff before enabling this page.</div>
      </div>
    </div>
  );
}
