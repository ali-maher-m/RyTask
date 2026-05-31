import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>RyTask</h1>
      <p>Open-source, self-hostable project management &amp; issue tracking.</p>
      <nav>
        <Link href="/inbox">Inbox</Link>
        {' · '}
        <Link href="/my-work">My Work</Link>
        {' · '}
        <Link href="/health">View system status</Link>
      </nav>
    </main>
  );
}
