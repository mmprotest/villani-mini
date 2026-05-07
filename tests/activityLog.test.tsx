/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ActivityLog from '../src/renderer/components/ActivityLog';

describe('ActivityLog', () => {
  test('renders runner events with at', () => {
    const html = renderToStaticMarkup(<ActivityLog items={[{ id: 'e1', type: 'runner.event', summary: 'Event summary', at: '2026-01-01T00:00:00.000Z' }]} />);
    expect(html).toContain('2026-01-01T00:00:00.000Z');
    expect(html).toContain('runner.event');
    expect(html).toContain('Event summary');
  });

  test('renders actions with createdAt', () => {
    const html = renderToStaticMarkup(<ActivityLog items={[{ id: 'a1', type: 'click', status: 'done', title: 'Click submit', createdAt: '2026-01-02T00:00:00.000Z' }]} />);
    expect(html).toContain('2026-01-02T00:00:00.000Z');
    expect(html).toContain('click');
    expect(html).toContain('done');
    expect(html).toContain('Click submit');
  });

  test('does not crash when timestamps are missing', () => {
    expect(() => renderToStaticMarkup(<ActivityLog items={[{ id: 'm1', type: 'note', summary: 'No timestamp' }]} />)).not.toThrow();
  });

  test('shows empty state', () => {
    const html = renderToStaticMarkup(<ActivityLog items={[]} />);
    expect(html).toContain('No activity yet.');
  });
});
