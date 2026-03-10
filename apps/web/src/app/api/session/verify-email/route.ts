import { NextRequest, NextResponse } from 'next/server';
import { getGatewayBaseUrl } from '../../../../lib/server/gateway';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.search;
  const upstream = await fetch(`${getGatewayBaseUrl()}/api/auth/verify-email${query}`, {
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
