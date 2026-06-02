import { describe, expect, it } from 'vitest';
import loginPageSource from '../pages/LoginPage.tsx?raw';
import aiTabSource from '../pages/tabs/AiTab.tsx?raw';

const FONT_PX: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
};

function resolveFontPx(className: string, width: number): number {
  let fontPx = 16;
  for (const token of className.split(/\s+/)) {
    if (token.startsWith('md:text-')) {
      if (width >= 768) {
        const resolved = FONT_PX[token.slice(3)];
        if (resolved) fontPx = resolved;
      }
      continue;
    }
    const resolved = FONT_PX[token];
    if (resolved) fontPx = resolved;
  }
  return fontPx;
}

function getClassName(source: string, tag: 'input' | 'textarea', occurrence = 0): string {
  const matches = [...source.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?className="([^"]+)"`, 'g'))];
  const match = matches[occurrence];
  if (!match) {
    throw new Error(`Could not find ${tag} #${occurrence + 1}`);
  }
  const className = match[1];
  if (!className) {
    throw new Error(`Could not read className for ${tag} #${occurrence + 1}`);
  }
  return className;
}

describe('mobile input/textarea font sizes', () => {
  it('keeps /login and /ai fields at 16px+ under md breakpoint', () => {
    const classes = {
      loginEmail: getClassName(loginPageSource, 'input', 0),
      loginPassword: getClassName(loginPageSource, 'input', 1),
      aiComposer: getClassName(aiTabSource, 'textarea', 0),
    };

    const resolved = {
      mobile: {
        loginEmail: resolveFontPx(classes.loginEmail, 375),
        loginPassword: resolveFontPx(classes.loginPassword, 375),
        aiComposer: resolveFontPx(classes.aiComposer, 375),
      },
      desktop: {
        loginEmail: resolveFontPx(classes.loginEmail, 1024),
        loginPassword: resolveFontPx(classes.loginPassword, 1024),
        aiComposer: resolveFontPx(classes.aiComposer, 1024),
      },
    };

    expect(resolved).toMatchInlineSnapshot(`
      {
        "desktop": {
          "aiComposer": 14,
          "loginEmail": 14,
          "loginPassword": 14,
        },
        "mobile": {
          "aiComposer": 16,
          "loginEmail": 16,
          "loginPassword": 16,
        },
      }
    `);

    expect(resolved.mobile.loginEmail).toBeGreaterThanOrEqual(16);
    expect(resolved.mobile.loginPassword).toBeGreaterThanOrEqual(16);
    expect(resolved.mobile.aiComposer).toBeGreaterThanOrEqual(16);
  });
});
