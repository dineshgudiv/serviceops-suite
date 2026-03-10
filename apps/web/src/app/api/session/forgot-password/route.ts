import { NextRequest, NextResponse } from 'next/server';
import { getGatewayBaseUrl } from '../../../../lib/server/gateway';

export async function POST(req: NextRequest) {
  const upstream = await fetch(`${getGatewayBaseUrl()}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: await req.text(),
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
