import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>HouseMind</h1>
      <p>The backend and frontend are connected!</p>
      {/* Replace these IDs with actual IDs from your DB once you have them */}
      <Link href="/workspace/demo-project/demo-image" style={{ color: 'blue' }}>
        Go to Workspace
      </Link>
    </div>
  );
}