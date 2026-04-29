export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Zenith AI OS</h1>
      <p>A reusable, multi-tenant, open-standard-ready AI Operating System.</p>
      <h2>API Endpoints</h2>
      <ul>
        <li><code>GET  /api/health</code> — Health check</li>
        <li><code>GET  /api/agents</code> — List agents</li>
        <li><code>POST /api/agents</code> — Run an agent</li>
        <li><code>GET  /api/tools</code> — List tools</li>
        <li><code>POST /api/tools</code> — Invoke a tool</li>
        <li><code>GET  /api/memory?query=...</code> — Search memory</li>
        <li><code>POST /api/memory</code> — Store memory</li>
        <li><code>POST /api/workflows</code> — Trigger workflow</li>
        <li><code>GET  /api/audit</code> — Run audit engine</li>
      </ul>
    </main>
  );
}
