/**
 * GET /api/audius/hosts — transparency endpoint for the Audius tab status chip.
 * Reports which discovery hosts the registry currently publishes. No secrets:
 * the Audius public API has no credentials (app_name attribution only).
 */
import { NextResponse } from 'next/server';

import { AUDIUS_APP_NAME, AUDIUS_HOST_REGISTRY } from '@/lib/lab/audius';
import { resolveAudiusHosts } from '@/lib/lab/audius-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { hosts, registryOk } = await resolveAudiusHosts();
  return NextResponse.json(
    {
      app: AUDIUS_APP_NAME,
      registry: AUDIUS_HOST_REGISTRY,
      registryOk,
      hosts,
      selected: hosts[0] ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
