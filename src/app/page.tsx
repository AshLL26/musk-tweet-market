import type { MarketAnalysisResponse } from '@/lib/types';

async function getMarketData(): Promise<MarketAnalysisResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const date = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${baseUrl}/api/market/full?date=${date}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch market data');
  return res.json();
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null) {
  return n === null ? '-' : n.toFixed(2);
}

export default async function HomePage() {
  const data = await getMarketData();
  const { snapshot, buckets, signal } = data;

  return (
    <main style={{ padding: 24, fontFamily: '"Inter", Arial, sans-serif', background: '#0b1020', minHeight: '100vh', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>📈 Musk Tweet Market</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            {snapshot.marketDate} UTC · State: <strong>{snapshot.currentState}</strong> · {snapshot.dayType} · {snapshot.eventMode}
          </p>
        </div>

        {/* Top metrics */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <Card title="Current Count" value={String(snapshot.currentTweetCount)} sub="tweets counted today" />
          <Card title="Time Left" value={`${snapshot.timeLeftHours.toFixed(1)}h`} sub={`Elapsed: ${snapshot.timeElapsedHours.toFixed(1)}h`} />
          <Card title="Effective Rate" value={`${snapshot.rates.effectiveRate.toFixed(2)}/h`} sub={`Momentum: ${snapshot.rates.momentumDirection}`} />
          <Card title="Event Boost" value={`×${snapshot.eventBoost.toFixed(2)}`} sub={`State ×${snapshot.stateBoost.toFixed(2)} · Time ×${snapshot.timeBoost.toFixed(2)}`} />
        </section>

        {/* Main panels */}
        <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Bucket pricing table */}
          <Panel title="Bucket Pricing">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                  <th style={th}>Bucket</th>
                  <th style={th}>Model</th>
                  <th style={th}>Market</th>
                  <th style={th}>Edge</th>
                  <th style={th}>Req Rate</th>
                  <th style={th}>Reach</th>
                  <th style={th}>Signal</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.bucketId} style={{ borderTop: '1px solid #1f2937' }}>
                    <td style={td}><strong>{b.label}</strong></td>
                    <td style={td}>{pct(b.modelProbability)}</td>
                    <td style={td}>{pct(b.normalizedMarketProbability)}</td>
                    <td style={{ ...td, color: edgeColor(b.edge) }}>
                      {b.edge >= 0 ? '+' : ''}{pct(b.edge)}
                    </td>
                    <td style={td}>{b.requiredRate !== null ? `${num(b.requiredRate)}/h` : '-'}</td>
                    <td style={{ ...td, color: reachColor(b.reachLabel) }}>{b.reachLabel}</td>
                    <td style={td}><Badge text={b.actionSignal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* Trading signal */}
          <Panel title="Trading Signal">
            <div style={{ marginBottom: 12, padding: 12, background: '#0b1020', borderRadius: 8, fontSize: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{signal.recommendation}</div>
              {signal.topLongBucketId && (
                <div style={{ color: '#22c55e', marginBottom: 4 }}>
                  Long: {signal.topLongBucketId} — {signal.topLongReason}
                </div>
              )}
              {signal.topShortBucketId && (
                <div style={{ color: '#ef4444', marginBottom: 4 }}>
                  Short: {signal.topShortBucketId} — {signal.topShortReason}
                </div>
              )}
              <div style={{ color: '#f59e0b', marginTop: 8, fontSize: 12 }}>
                ⚠ {signal.riskWarning}
              </div>
            </div>
          </Panel>
        </section>

        {/* Rate metrics */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Card title="Global Rate" value={`${snapshot.rates.globalRate.toFixed(2)}/h`} sub="since day start" />
          <Card title="15m Rate" value={`${snapshot.rates.rate15m.toFixed(2)}/h`} sub="last 15 minutes" />
          <Card title="30m Rate" value={`${snapshot.rates.rate30m.toFixed(2)}/h`} sub="last 30 minutes" />
          <Card title="60m Rate" value={`${snapshot.rates.rate60m.toFixed(2)}/h`} sub="last 60 minutes" />
        </section>
      </div>
    </main>
  );
}

function edgeColor(edge: number) {
  if (edge >= 0.08) return '#22c55e';
  if (edge <= -0.08) return '#ef4444';
  if (edge > 0) return '#86efac';
  if (edge < 0) return '#fca5a5';
  return '#e5e7eb';
}

function reachColor(label: string) {
  if (label === 'easy') return '#22c55e';
  if (label === 'possible') return '#86efac';
  if (label === 'hard') return '#f59e0b';
  return '#ef4444';
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#111827', padding: 16, borderRadius: 12, border: '1px solid #1f2937' }}>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 2 }}>{value}</div>
      {sub ? <div style={{ color: '#94a3b8', fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#111827', padding: 20, borderRadius: 12, border: '1px solid #1f2937' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Badge({ text }: { text: string }) {
  const bg = text === 'long' ? '#14532d' : text === 'short' ? '#7f1d1d' : text === 'watch' ? '#78350f' : '#374151';
  const color = text === 'long' ? '#22c55e' : text === 'short' ? '#ef4444' : text === 'watch' ? '#f59e0b' : '#9ca3af';
  return <span style={{ background: bg, color, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{text}</span>;
}

const th = { padding: '10px 8px', fontWeight: 600, fontSize: 13 } as const;
const td = { padding: '12px 8px' } as const;
