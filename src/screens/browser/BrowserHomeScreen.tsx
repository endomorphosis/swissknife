import React, { type CSSProperties, type ReactElement } from 'react';
import { APP_IDS } from '../../shared/constants/index.js';
import { BrowserRuntimeSummary } from '../../components/browser/index.js';

export interface BrowserHomeScreenProps {
  readonly title?: string;
}

const screenStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  padding: '1rem',
};

const appGridStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
};

export function BrowserHomeScreen({ title = 'SwissKnife' }: BrowserHomeScreenProps): ReactElement {
  return (
    <main aria-label="SwissKnife browser home" style={screenStyle}>
      <header>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{title}</h1>
      </header>

      <BrowserRuntimeSummary />

      <section aria-label="Available browser apps" style={appGridStyle}>
        {Object.values(APP_IDS).map(appId => (
          <article
            key={appId}
            style={{
              border: '1px solid var(--sk-border, #d1d5db)',
              borderRadius: '8px',
              padding: '0.75rem',
              background: 'var(--sk-surface-muted, #f9fafb)',
            }}
          >
            <strong>{appId}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
