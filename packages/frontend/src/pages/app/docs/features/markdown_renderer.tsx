import { useState, useEffect, useRef, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import { codeToHtml } from 'shiki';
import { Link } from '@tanstack/react-router';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [processed, setProcessed] = useState('');

  useEffect(() => {
    preprocessMarkdown(content).then(setProcessed);
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('button.copy');
      if (!btn) return;
      const pre = btn.closest('div')?.querySelector('pre code');
      if (!pre?.textContent) return;
      copyToClipboard(pre.textContent).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 2000);
      });
    }

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [processed]);

  if (!processed) return null;

  return (
    <div className={'prose-doc'} ref={containerRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeRaw]}
        components={{
          h1: HeadingOne,
          h2: HeadingTwo,
          h3: HeadingThree,
          h4: HeadingFour,
          a: MarkdownLink,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

type AdmonitionType = 'warning' | 'danger' | 'tip' | 'info';

async function preprocessMarkdown(md: string): Promise<string> {
  const withAdmonitions = preprocessAdmonitions(md);
  return highlightCodeBlocks(withAdmonitions);
}

function preprocessAdmonitions(md: string): string {
  return md.replace(
    /^::: (warning|danger|tip|info)(?: (.+))?\n([\s\S]*?)^:::/gm,
    (_match, type: AdmonitionType, title: string | undefined, body: string) => {
      const trimmedBody = body.trim();
      const label = title || type.toUpperCase();
      const paragraphs = trimmedBody
        .split('\n\n')
        .map((p) => `<p>${p.trim()}</p>`)
        .join('');
      return (
        `<div class="${type} custom-block">` +
        `<p class="custom-block-title custom-block-title-default">${label}</p>` +
        paragraphs +
        `</div>`
      );
    }
  );
}

const SUPPORTED_LANGS = ['bash', 'shell', 'typescript', 'javascript', 'yaml', 'json', 'ini', 'env', 'text'];

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCodeBlockHtml(lang: string, code: string, highlighted: string | null): string {
  const inner = highlighted ?? `<pre><code>${escapeHtml(code)}</code></pre>`;
  return (
    `<div class="language-${lang || 'text'}">` +
    `<button title="Copy code" class="copy"></button>` +
    (lang ? `<span class="lang">${lang}</span>` : '') +
    inner +
    `</div>`
  );
}

async function highlightCodeBlocks(md: string): Promise<string> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const matches = Array.from(md.matchAll(codeBlockRegex));

  if (matches.length === 0) return md;

  const replacements = await Promise.all(
    matches.map(async (match) => {
      const lang = match[1] || '';
      const code = match[2].trimEnd();

      try {
        const resolvedLang = SUPPORTED_LANGS.includes(lang) ? lang : 'text';
        const highlighted = await codeToHtml(code, {
          lang: resolvedLang,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
        return buildCodeBlockHtml(lang, code, highlighted);
      } catch {
        return buildCodeBlockHtml(lang, code, null);
      }
    })
  );

  let result = md;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    result = result.slice(0, match.index) + replacements[i] + result.slice(match.index! + match[0].length);
  }

  return result;
}

function HeadingOne({ node: _, ...rest }: ComponentProps<'h1'> & { node?: unknown }) {
  return <h1 {...rest} />;
}

function HeadingTwo({ node: _, ...rest }: ComponentProps<'h2'> & { node?: unknown }) {
  return <h2 {...rest} />;
}

function HeadingThree({ node: _, ...rest }: ComponentProps<'h3'> & { node?: unknown }) {
  return <h3 {...rest} />;
}

function HeadingFour({ node: _, ...rest }: ComponentProps<'h4'> & { node?: unknown }) {
  return <h4 {...rest} />;
}

type MarkdownLinkProps = ComponentProps<'a'>;

function MarkdownLink({ href, children, ...props }: MarkdownLinkProps) {
  if (href?.startsWith('/guide/') || href?.startsWith('/')) {
    const slug = href.replace(/^\/guide\//, '').replace(/^\//, '');
    if (slug && !slug.includes('://')) {
      return (
        <Link to={'/app/docs/$slug'} params={{ slug }}>
          {children}
        </Link>
      );
    }
  }

  return (
    <a href={href} target={'_blank'} rel={'noopener noreferrer'} {...props}>
      {children}
    </a>
  );
}
