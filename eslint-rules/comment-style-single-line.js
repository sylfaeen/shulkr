// Enforces .claude/rules/style-comment-style.md for JS/TS/TSX:
// 1. A multi-line /** */ or /* */ block that contains no @-tag must be rewritten as // lines.
// 2. A multi-line /** */ block that mixes prose then @-tag(s) must be split: prose as // lines above the docblock, only the @-tag lines stay inside /** */.
// 3. A multi-line /** */ block that is tags-only is left untouched.
// 4. A run of consecutive `// foo` / `// bar` line comments (same indent, no blank line between, no trailing end-of-line comment) gets collapsed into a single `// foo bar` line. Tooling directives (eslint-, @ts-, biome-, prettier-, istanbul, c8, v8, flow:) and decorative separators (---, ===, ***, ___) are skipped.

const TAG_LINE_RE = /^\s*@\w/;
const SEPARATOR_RE = /^[-=*_]{3,}/;
const LIST_RE = /^([-*]|\d+[.)])\s/;
const DIRECTIVE_RE = /^(eslint-|biome-|prettier-|jshint\b|istanbul\s+ignore|c8\s+ignore|v8\s+ignore|flow:|@ts-|@typescript-eslint-|@eslint-)/;

function indentBefore(sourceCode, range) {
  const text = sourceCode.text;
  const start = range[0];
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return text.slice(lineStart, start);
}

function isLineLeading(sourceCode, comment) {
  const lineStart = sourceCode.text.lastIndexOf('\n', comment.range[0] - 1) + 1;
  const before = sourceCode.text.slice(lineStart, comment.range[0]);
  return /^\s*$/.test(before);
}

function lineGapBetween(sourceCode, a, b) {
  return b.loc.start.line - a.loc.end.line;
}

function extractDocblockLines(value) {
  // Strip the leading `*` from `/** */` body, then split.
  const body = value.replace(/^\*/, '');
  const raw = body.split(/\r?\n/);
  const cleaned = raw.map((line) => line.replace(/^\s*\*\s?/, '').replace(/\s+$/, ''));
  while (cleaned.length > 0 && cleaned[0].trim() === '') cleaned.shift();
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();
  return cleaned;
}

function reflowParagraphs(lines) {
  const out = [];
  let current = '';
  const flush = () => {
    if (current.trim() !== '') out.push(current.trim());
    current = '';
  };
  for (const line of lines) {
    const trimmed = line.replace(/^\s+/, '');
    if (trimmed === '') {
      flush();
      continue;
    }
    if (LIST_RE.test(trimmed)) {
      flush();
      current = trimmed;
      continue;
    }
    current = current === '' ? trimmed : current + ' ' + trimmed;
  }
  flush();
  return out;
}

function buildBlockReplacement(proseLines, tagLines, indent) {
  const parts = [];
  for (let i = 0; i < proseLines.length; i++) {
    const line = proseLines[i];
    parts.push(line === '' ? '//' : '// ' + line);
    if (i < proseLines.length - 1 || tagLines.length > 0) {
      parts.push('\n' + indent);
    }
  }
  if (tagLines.length > 0) {
    parts.push('/**\n');
    for (const t of tagLines) {
      parts.push(indent + ' * ' + t.replace(/^\s+/, '') + '\n');
    }
    parts.push(indent + ' */');
  }
  return parts.join('');
}

function checkBlockComment(comment, context, sourceCode) {
  const value = comment.value;
  const isDocblock = value.startsWith('*');
  const isMultiline = value.includes('\n');
  if (!isMultiline) return;
  if (!isDocblock && !value.startsWith(' ') && !value.startsWith('\n')) return;

  const lines = extractDocblockLines(value);
  if (lines.length === 0) return;

  let firstTagIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (TAG_LINE_RE.test(lines[i])) {
      firstTagIdx = i;
      break;
    }
  }

  if (firstTagIdx === 0) return;

  let proseLines = firstTagIdx === -1 ? lines : lines.slice(0, firstTagIdx);
  let tagLines = firstTagIdx === -1 ? [] : lines.slice(firstTagIdx);

  while (proseLines.length > 0 && proseLines[proseLines.length - 1].trim() === '') proseLines.pop();
  while (tagLines.length > 0 && tagLines[0].trim() === '') tagLines.shift();
  if (proseLines.length === 0) return;

  proseLines = reflowParagraphs(proseLines);

  const indent = indentBefore(sourceCode, comment.range);
  const replacement = buildBlockReplacement(proseLines, tagLines, indent);

  const messageId = tagLines.length > 0 ? 'mixedDocblock' : 'proseInDocblock';
  context.report({
    loc: comment.loc,
    messageId,
    fix: (fixer) => fixer.replaceTextRange(comment.range, replacement),
  });
}

function isMergeableLineComment(comment) {
  if (comment.type !== 'Line') return false;
  const body = comment.value.trim();
  if (body === '') return false;
  if (DIRECTIVE_RE.test(body)) return false;
  if (SEPARATOR_RE.test(body)) return false;
  if (LIST_RE.test(body)) return false;
  return true;
}

function findLineCommentRuns(comments, sourceCode) {
  const runs = [];
  let i = 0;
  while (i < comments.length) {
    const head = comments[i];
    if (!isMergeableLineComment(head) || !isLineLeading(sourceCode, head)) {
      i++;
      continue;
    }
    const headIndent = indentBefore(sourceCode, head.range);
    const run = [head];
    let j = i + 1;
    while (j < comments.length) {
      const next = comments[j];
      if (!isMergeableLineComment(next)) break;
      if (lineGapBetween(sourceCode, run[run.length - 1], next) !== 1) break;
      if (indentBefore(sourceCode, next.range) !== headIndent) break;
      run.push(next);
      j++;
    }
    if (run.length >= 2) runs.push(run);
    i = j;
  }
  return runs;
}

function reportLineRun(run, context) {
  const merged = '// ' + run.map((c) => c.value.trim()).join(' ');
  const startRange = run[0].range[0];
  const endRange = run[run.length - 1].range[1];
  context.report({
    loc: {
      start: run[0].loc.start,
      end: run[run.length - 1].loc.end,
    },
    messageId: 'adjacentLineRun',
    fix: (fixer) => fixer.replaceTextRange([startRange, endRange], merged),
  });
}

export default {
  meta: {
    type: 'layout',
    fixable: 'code',
    docs: {
      description: 'Enforce single-line // comments and split docblocks per .claude/rules/style-comment-style.md',
    },
    messages: {
      proseInDocblock: 'Prose-only block comment must be rewritten as // lines (style-comment-style.md rule 1).',
      mixedDocblock: 'Block comment mixes prose and @-tag(s); split prose into // lines above the docblock (style-comment-style.md rule 2).',
      adjacentLineRun: 'Adjacent // comments on consecutive lines must be merged into a single // line (style-comment-style.md rule 4).',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program() {
        const comments = sourceCode.getAllComments();
        for (const comment of comments) {
          if (comment.type === 'Block') checkBlockComment(comment, context, sourceCode);
        }
        const runs = findLineCommentRuns(comments, sourceCode);
        for (const run of runs) reportLineRun(run, context);
      },
    };
  },
};
