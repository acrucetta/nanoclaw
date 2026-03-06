import { describe, expect, it } from 'vitest';

import { renderTelegramHtml } from './telegram-format.js';

describe('renderTelegramHtml', () => {
  it('renders bold, italic, strikethrough, and spoilers as Telegram HTML', () => {
    expect(renderTelegramHtml('**bold** *italic* ~~gone~~ ||secret||')).toBe(
      '<b>bold</b> <i>italic</i> <s>gone</s> <tg-spoiler>secret</tg-spoiler>',
    );
  });

  it('renders headings and blockquotes with supported HTML tags', () => {
    expect(renderTelegramHtml('# Title\n> quoted\n> line')).toBe(
      '<b>Title</b>\n<blockquote>quoted\nline</blockquote>',
    );
  });

  it('renders fenced code blocks and inline code', () => {
    expect(renderTelegramHtml('Use `npm test`\n```ts\nconst x = 1;\n```')).toBe(
      'Use <code>npm test</code>\n<pre><code class="language-ts">const x = 1;</code></pre>',
    );
  });

  it('renders safe inline links and escapes surrounding HTML', () => {
    expect(
      renderTelegramHtml(
        'Look at [docs](https://example.com?q=1&v=2) <unsafe>',
      ),
    ).toBe(
      'Look at <a href="https://example.com?q=1&amp;v=2">docs</a> &lt;unsafe&gt;',
    );
  });

  it('leaves unsupported link schemes as escaped text', () => {
    expect(renderTelegramHtml('[bad](javascript:alert(1))')).toBe(
      '[bad](javascript:alert(1))',
    );
  });
});
