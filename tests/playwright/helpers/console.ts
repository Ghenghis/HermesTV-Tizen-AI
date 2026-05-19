import type { Page, ConsoleMessage } from '@playwright/test';

// Attach a console-error collector to a page.
// Returns a getter that yields the filtered error list when called.
// Filters favicon noise + the documented stub 503s so specs only flag
// real regressions.
export function collectConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('favicon')) return;
      if (text.includes('Failed to load resource')) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (err: Error) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return () => errors.slice();
}

// Selects the first profile tile matching the persona name.
// Uses the aria-label set by ProfilePicker.jsx.
export function profileSelector(displayName: 'Sherri' | 'Dave' | string) {
  return `button[aria-label*="${displayName}"]`;
}
