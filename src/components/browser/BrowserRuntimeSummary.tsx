import React, { type CSSProperties, type ReactElement } from 'react';
import { APP_IDS } from '../../shared/constants/index.js';
import {
  useBrowserPlatformSnapshot,
  type BrowserPlatformSnapshot,
} from '../../hooks/browser/index.js';

export interface BrowserRuntimeSummaryProps {
  readonly snapshot?: BrowserPlatformSnapshot;
  readonly compact?: boolean;
}

const panelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  padding: '1rem',
  border: '1px solid var(--sk-border, #d1d5db)',
  borderRadius: '8px',
  background: 'var(--sk-surface, #ffffff)',
  color: 'var(--sk-text, #111827)',
};

const metricGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))',
};

const metricStyle: CSSProperties = {
  display: 'grid',
  gap: '0.125rem',
};

export function BrowserRuntimeSummary({
  snapshot,
  compact = false,
}: BrowserRuntimeSummaryProps): ReactElement {
  const liveSnapshot = useBrowserPlatformSnapshot();
  const current = snapshot ?? liveSnapshot;
  const appCount = Object.keys(APP_IDS).length;

  return (
    <section aria-label="Browser runtime summary" style={panelStyle}>
      <div>
        <h2 style={{ fontSize: compact ? '1rem' : '1.125rem', margin: 0 }}>SwissKnife Browser Runtime</h2>
      </div>

      <div style={metricGridStyle}>
        <RuntimeMetric label="Runtime" value={current.runtime} />
        <RuntimeMetric label="Apps" value={String(appCount)} />
        <RuntimeMetric label="Providers" value={String(current.providers.length)} />
        <RuntimeMetric label="Tasks" value={`${current.pendingTaskCount}/${current.taskCount}`} />
      </div>
    </section>
  );
}

function RuntimeMetric({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div style={metricStyle}>
      <span style={{ color: 'var(--sk-muted, #4b5563)', fontSize: '0.75rem' }}>{label}</span>
      <strong style={{ fontSize: '1rem' }}>{value}</strong>
    </div>
  );
}
