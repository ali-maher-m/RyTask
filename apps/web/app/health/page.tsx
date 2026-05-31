import { RytaskClient } from '@rytask/sdk';
import Link from 'next/link';

// Read live status at request time, not build time.
export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const baseUrl = process.env.API_URL ?? 'http://localhost:3001';
  let status = 'unknown';
  try {
    const readiness = await new RytaskClient({ baseUrl }).readiness();
    status = readiness.status;
  } catch {
    status = 'unreachable';
  }

  return (
    <main>
      <h1>System status</h1>
      <p>
        API readiness: <strong>{status}</strong>
      </p>
      <nav>
        <Link href="/">Back to home</Link>
      </nav>
    </main>
  );
}
