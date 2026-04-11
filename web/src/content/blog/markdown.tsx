import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Lightweight markdown renderer for blog posts.
 * Handles: headings, paragraphs, lists, code blocks, inline code, bold, links, tables.
 * Returns React nodes (not innerHTML) so Next Link components work for internal links.
 */

export function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.trim().split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        <pre
          key={`code-${key++}`}
          className="my-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed"
        >
          {lang && (
            <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-600">
              {lang}
            </div>
          )}
          <code className="font-mono text-zinc-300">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      out.push(
        <h1 key={`h1-${key++}`} className="mb-6 mt-8 text-3xl font-bold text-zinc-100 md:text-4xl">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(
        <h2 key={`h2-${key++}`} className="mb-4 mt-10 text-2xl font-bold text-zinc-100">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(
        <h3 key={`h3-${key++}`} className="mb-3 mt-6 text-xl font-semibold text-zinc-100">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Tables (simple pipe-separated)
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const headers = line.split('|').map((h) => h.trim()).filter(Boolean);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter(Boolean));
        i++;
      }
      out.push(
        <div key={`table-${key++}`} className="my-6 overflow-x-auto">
          <table className="min-w-full border-collapse border border-zinc-800 text-sm">
            <thead className="bg-zinc-900">
              <tr>
                {headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="border border-zinc-800 px-4 py-2 text-left font-semibold text-zinc-200"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-zinc-800 px-4 py-2 text-zinc-400"
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^\s*-\s/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        items.push(
          <li key={`li-${key++}`} className="leading-relaxed text-zinc-300">
            {renderInline(lines[i].replace(/^\s*-\s/, ''))}
          </li>
        );
        i++;
      }
      out.push(
        <ul key={`ul-${key++}`} className="my-4 ml-6 list-disc space-y-2">
          {items}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(
          <li key={`oli-${key++}`} className="leading-relaxed text-zinc-300">
            {renderInline(lines[i].replace(/^\s*\d+\.\s/, ''))}
          </li>
        );
        i++;
      }
      out.push(
        <ol key={`ol-${key++}`} className="my-4 ml-6 list-decimal space-y-2">
          {items}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (consume consecutive non-empty, non-special lines)
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !/^\s*[-\d]/.test(lines[i]) &&
      !lines[i].startsWith('|') &&
      !lines[i].trimStart().startsWith('```')
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(
      <p key={`p-${key++}`} className="my-4 leading-relaxed text-zinc-300">
        {renderInline(paraLines.join(' '))}
      </p>
    );
  }

  return out;
}

/**
 * Inline formatting: bold, italic, inline code, links.
 */
function renderInline(text: string): ReactNode {
  const tokens: ReactNode[] = [];
  let key = 0;
  let remaining = text;

  // Process in order: links, code, bold, italic
  // We tokenize by finding the next match of any pattern
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
  const codeRegex = /`([^`]+)`/;
  const boldRegex = /\*\*([^*]+)\*\*/;
  const italicRegex = /\*([^*]+)\*/;

  while (remaining.length > 0) {
    // Find earliest match
    const linkMatch = linkRegex.exec(remaining);
    const codeMatch = codeRegex.exec(remaining);
    const boldMatch = boldRegex.exec(remaining);
    const italicMatch = italicRegex.exec(remaining);

    const candidates: { match: RegExpExecArray; type: string }[] = [];
    if (linkMatch) candidates.push({ match: linkMatch, type: 'link' });
    if (codeMatch) candidates.push({ match: codeMatch, type: 'code' });
    if (boldMatch) candidates.push({ match: boldMatch, type: 'bold' });
    if (italicMatch) candidates.push({ match: italicMatch, type: 'italic' });

    if (candidates.length === 0) {
      tokens.push(<span key={`txt-${key++}`}>{remaining}</span>);
      break;
    }

    candidates.sort((a, b) => a.match.index - b.match.index);
    const { match, type } = candidates[0];

    if (match.index > 0) {
      tokens.push(<span key={`txt-${key++}`}>{remaining.slice(0, match.index)}</span>);
    }

    if (type === 'link') {
      const label = match[1];
      const url = match[2];
      const isInternal = url.startsWith('/');
      if (isInternal) {
        tokens.push(
          <Link
            key={`lnk-${key++}`}
            href={url}
            className="text-orange-400 underline decoration-orange-500/40 underline-offset-2 hover:text-orange-300"
          >
            {label}
          </Link>
        );
      } else {
        tokens.push(
          <a
            key={`lnk-${key++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 underline decoration-orange-500/40 underline-offset-2 hover:text-orange-300"
          >
            {label}
          </a>
        );
      }
    } else if (type === 'code') {
      tokens.push(
        <code
          key={`cd-${key++}`}
          className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-orange-300"
        >
          {match[1]}
        </code>
      );
    } else if (type === 'bold') {
      tokens.push(
        <strong key={`b-${key++}`} className="font-semibold text-zinc-100">
          {match[1]}
        </strong>
      );
    } else if (type === 'italic') {
      tokens.push(
        <em key={`i-${key++}`} className="italic">
          {match[1]}
        </em>
      );
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  return <>{tokens}</>;
}
