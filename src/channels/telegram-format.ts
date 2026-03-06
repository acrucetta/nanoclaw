const FENCED_CODE_PLACEHOLDER = '\uE000';
const INLINE_CODE_PLACEHOLDER = '\uE001';

interface Placeholder {
  token: string;
  html: string;
}

export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPlaceholder(
  placeholders: Placeholder[],
  prefix: string,
  html: string,
): string {
  const token = `${prefix}${placeholders.length}\uE0FF`;
  placeholders.push({ token, html });
  return token;
}

function restorePlaceholders(
  text: string,
  placeholders: Placeholder[],
): string {
  let restored = text;
  for (const { token, html } of placeholders) {
    restored = restored.split(token).join(html);
  }
  return restored;
}

function sanitizeHref(href: string): string | null {
  if (/^(https?:\/\/|mailto:|tg:\/\/)/i.test(href)) {
    return href;
  }
  return null;
}

function formatInline(text: string): string {
  const inlineCode: Placeholder[] = [];
  let escaped = escapeTelegramHtml(text).replace(
    /`([^`\n]+)`/g,
    (_match, code: string) =>
      createPlaceholder(
        inlineCode,
        INLINE_CODE_PLACEHOLDER,
        `<code>${escapeTelegramHtml(code)}</code>`,
      ),
  );

  escaped = escaped.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (match, label: string, href: string) => {
      const safeHref = sanitizeHref(href);
      if (!safeHref) return match;
      return `<a href="${safeHref}">${label}</a>`;
    },
  );

  escaped = escaped.replace(
    /\|\|([\s\S]+?)\|\|/g,
    '<tg-spoiler>$1</tg-spoiler>',
  );
  escaped = escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
  escaped = escaped.replace(/__([\s\S]+?)__/g, '<b>$1</b>');
  escaped = escaped.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
  escaped = escaped.replace(
    /(^|[\s(])\*([^*\n]+?)\*(?=[$\s).,!?:;])/gm,
    '$1<i>$2</i>',
  );
  escaped = escaped.replace(
    /(^|[\s(])_([^_\n]+?)_(?=[$\s).,!?:;])/gm,
    '$1<i>$2</i>',
  );

  return restorePlaceholders(escaped, inlineCode);
}

function formatBlocks(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? '';

    if (/^\s*>/.test(line)) {
      const blockquoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) {
        blockquoteLines.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
        i += 1;
      }
      output.push(
        `<blockquote>${blockquoteLines.map((entry) => formatInline(entry)).join('\n')}</blockquote>`,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      output.push(`<b>${formatInline(headingMatch[2])}</b>`);
      i += 1;
      continue;
    }

    output.push(formatInline(line));
    i += 1;
  }

  return output.join('\n');
}

export function renderTelegramHtml(rawText: string): string {
  const fencedCode: Placeholder[] = [];
  const withoutFencedCode = rawText.replace(
    /```([a-zA-Z0-9_+-]+)?\n?([\s\S]*?)```/g,
    (_match, language: string | undefined, code: string) => {
      const trimmedCode = code.replace(/^\n/, '').replace(/\n$/, '');
      const html = language
        ? `<pre><code class="language-${escapeTelegramHtml(language)}">${escapeTelegramHtml(trimmedCode)}</code></pre>`
        : `<pre>${escapeTelegramHtml(trimmedCode)}</pre>`;
      return createPlaceholder(fencedCode, FENCED_CODE_PLACEHOLDER, html);
    },
  );

  return restorePlaceholders(formatBlocks(withoutFencedCode), fencedCode);
}
