export function getGatewayBaseUrl() {
  const configuredBaseUrl =
    process.env.GATEWAY_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://127.0.0.1:8080';
  }

  throw new Error('Missing gateway base URL. Set GATEWAY_INTERNAL_URL or NEXT_PUBLIC_API_BASE_URL.');
}
