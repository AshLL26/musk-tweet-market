async function getMarketData() {
  const res = await fetch('http://localhost:3000/api/market/full', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch market data');
  return res.json();
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function HomePage() {
  const data = await getMarketData();
  const { snapshot, buckets, signal } = data;

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif', background: '#0b1020', minHeight: '100vh', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Musk Tweet Market Dashboard</h1>
        <p style={{ color: '#94a3b8', marginBottom: 24 }}>Prediction-market oriented intraday pricing panel</p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <Card title="Current Count" value={String(snapshot.currentTweetCount)} sub={`${snapshot.marketDate} UTC`} />
          <Card title="State" value={snapshot.currentState} sub={`Day type: ${snapshot.dayType}`} />
          <Card title="Time Left" value={`${snapshot.timeLeftHours.toFixed(2)}h`} sub={`Elapsed: ${snapshot.timeElapsedHours.toFixed(2)}h`} />
          <Card title="Effective Rate" value={snapshot.rates.effectiveRate.toFixed(2)} sub={`Momentum: ${snapshot.rates.momentumDirection}`} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <Panel title="Bucket Pricing">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#94a3b8' }}>
                  <th style={th}>Bucket</th>
                  <th style={th}>Model</th>
                  <th style={th}>Market</th>
                  <th style={th}>Edge</th>
                  <th style={th}>Reach</th>
                  <th style={th}>Signal</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b: any) => (
                  <tr key={b.bucketId} style={{ borderTop: '1px solid #1f2937' }}>
                    <td style={td}>{b.label}</td>
                    <td style={td}>{pct(b.modelProbability)}</td>
                    <td style={td}>{pct(b.normalizedMarketProbability)}</td>
                    <td style={{ ...td, color: b.edge > 0 ? '#22c55e' : b.edge < 0 ? '#ef4444' : '#e5e7eb' }}>
                      {pct(b.edge)}
                    </td>
                    <td style={td}>{b.reachLabel}</td>
                    <td style={td}><Badge text={b.actionSignal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Trading Signal">
            <p><strong>Recommendation:</strong> {signal.recommendation}</p>
            <p><strong>Top Long:</strong> {signal.topLongBucketId ?? '-'}</p>
            <p><strong>Top Short:</strong> {signal.topShortBucketId ?? '-'}</p>
            <p><strong>Long Reason:</strong> {signal.topLongReason || '-'}</p>
            <p><strong>Short Reason:</strong> {signal.topShortReason || '-'}</p>
            <p><strong>Risk:</strong> {signal.riskWarning}</p>
          </Panel>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Card title="Global Rate" value={snapshot.rates.globalRate.toFixed(2)} sub="tweets/hour" />
          <Card title="15m Rate" value={snapshot.rates.rate15m.toFixed(2)} sub="tweets/hour" />
          <Card title="30m Rate" value={snapshot.rates.rate30m.toFixed(2)} sub="tweets/hour" />
          <Card title="60m Rate" value={snapshot.rates.rate60m.toFixed(2)} sub="tweets/hour" />
        </section>
      </div>
    </main>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#111827', padding: 16, borderRadius: 12, border: '1px solid #1f2937' }}>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      {sub ? <div style={{ color: '#94a3b8', fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#111827', padding: 16, borderRadius: 12, border: '1px solid #1f2937' }}>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function Badge({ text }: { text: string }) {
  const bg = text === 'long' ? '#14532d' : text === 'short' ? '#7f1d1d' : text === 'watch' ? '#78350f' : '#374151';
  return <span style={{ background: bg, padding: '4px 8px', borderRadius: 999, fontSize: 12 }}>{text}</span>;
}

const th = { padding: '10px 8px' } as const;
const td = { padding: '12px 8px' } as const;
