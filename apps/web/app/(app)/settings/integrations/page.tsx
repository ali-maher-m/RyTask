import { IntegrationsClient } from './integrations-client';

/**
 * Slack integration settings (M3, US1, FR-WEB-101/103). Server shell that mounts the interactive
 * `IntegrationsClient`: shows connection status (any member), and — for owners/admins — connect
 * via Slack's consent flow, pick the capture default project, and disconnect. Live, per-request;
 * reads the `?connected=1` / `?error=` result of the OAuth return.
 */
export const dynamic = 'force-dynamic';

export default function IntegrationsPage() {
  return <IntegrationsClient />;
}
