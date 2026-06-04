import { TokensClient } from './tokens-client';

/**
 * Personal Access Token settings (US7, T100, FR-AUTH-007, SC-012). Server shell that mounts the
 * interactive `TokensClient`, which lists the holder's tokens (`GET /api-tokens`), mints new ones
 * with a chosen scope (`POST /api-tokens`, secret shown once), and revokes them
 * (`DELETE /api-tokens/{id}`). Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function TokensPage() {
  return <TokensClient />;
}
