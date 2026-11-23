// fastsite: a faster drop-in for makefun-site 1.0.0 (make.fun's reference static site generator, MIT).
// The build keeps its template, slug and link caches local to the input. Markdown scans for inline
// delimiters and reuses untrimmed source spans for paragraphs and fences.

// ------------------------------------------------------------------------------------------------ text

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ESC_FIND = /[&<>"']/g;

/** Escape HTML metacharacters, reusing the original string when there are none. */
function esc(s) {
  ESC_FIND.lastIndex = 0;
  if (!ESC_FIND.test(s)) return s;
  let start = 0;
  let out = '';
  do {
    const i = ESC_FIND.lastIndex - 1;
    out += s.slice(start, i) + escCode(s.charCodeAt(i), s[i]);
    start = i + 1;
  } while (ESC_FIND.test(s));
  return out + s.slice(start);
}

/** The escape of one character code. */
function escCode(c, ch) {
  if (c === 38) return '&amp;';
  if (c === 60) return '&lt;';
  if (c === 62) return '&gt;';
  if (c === 34) return '&quot;';
  if (c === 39) return '&#39;';
  return ch;
}

/** Whether a UTF-16 code unit is whitespace as RegExp \s reads it. */
function isWs(c) {
  if (c <= 32) return c === 32 || (c >= 9 && c <= 13);
  if (c < 160) return false;
  return c === 160 || c === 5760 || (c >= 8192 && c <= 8202) || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
}

/** The reading time counts runs of non-whitespace, in groups of 200. */
const WORD_GROUP = /\s*\S+(?:\s+\S+){199}\s*/y;

function readingMinutes(s) {
  if (s.length <= 400) return 1;
  WORD_GROUP.lastIndex = 0;
  let minutes = 1;
  while (WORD_GROUP.test(s) && WORD_GROUP.lastIndex < s.length) minutes++;
  return minutes;
}

const MARK = /\p{M}/gu;
const NON_ASCII = /[^\x00-\x7f]/;
const SLUG_GAP = /[^A-Za-z0-9]+/g;

/** Normalize before ASCII filtering. Drop a separator at the 64-character cut. */

function slugRaw(text) {
  const plain = NON_ASCII.test(text) ? text.normalize('NFKD').replace(MARK, '') : text;
  const dashed = plain.replace(SLUG_GAP, '-');
  const start = dashed.charCodeAt(0) === 45 ? 1 : 0;
  let end = Math.min(dashed.length, start + 64);
  if (dashed.charCodeAt(end - 1) === 45) end--;
  return dashed.slice(start, end).toLowerCase() || 'untitled';
}

function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Spaces and tabs dropped at both ends. */
function trimST(s) {
  let a = 0;
  let b = s.length;
  while (a < b) {
    const c = s.charCodeAt(a);
    if (c !== 32 && c !== 9) break;
    a++;
  }
  while (b > a) {
    const c = s.charCodeAt(b - 1);
    if (c !== 32 && c !== 9) break;
    b--;
  }
  return a === 0 && b === s.length ? s : s.slice(a, b);
}

/** Whether `s` from `from` on holds only spaces and tabs. */
function blankFrom(s, from) {
  for (let i = from, n = s.length; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ front matter

const FM_KEYS = new Set(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);
const FM_LINE = /^([a-z_]+):(?: (.*))?$/;
const FM_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FM_NAME = /^[a-z0-9-]+$/;
const FM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FM_TAG = /^[^"[\]]+$/;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function stringOf(raw) {
  if (raw.charCodeAt(0) === 34) {
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return s.error !== undefined ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = FM_DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (raw.charCodeAt(0) !== 91 || raw.charCodeAt(raw.length - 1) !== 93) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      for (const t of tags) if (t === '' || !FM_TAG.test(t)) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return FM_NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return FM_SLUG.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

/** Front matter and body of `text` ("\n" line ends): { data, body } or { error }. */
function parseFrontMatter(text) {
  // The first line must be exactly "---".
  if (!(text.startsWith('---') && (text.length === 3 || text.charCodeAt(3) === 10))) return { error: 'no front matter' };
  if (text.length === 3) return { error: 'the front matter is not closed' };
  // Find the closing line "---" (a line holding exactly ---).
  let pos = 4;
  let closeStart = -1;
  let bodyStart = -1;
  const n = text.length;
  while (pos <= n) {
    let nl = text.indexOf('\n', pos);
    if (nl === -1) nl = n;
    if (nl - pos === 3 && text.charCodeAt(pos) === 45 && text.charCodeAt(pos + 1) === 45 && text.charCodeAt(pos + 2) === 45) {
      closeStart = pos;
      bodyStart = nl === n ? -1 : nl + 1;
      break;
    }
    if (nl === n) break;
    pos = nl + 1;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };
  const data = {};
  let lineNo = 2;
  let p = 4;
  while (p < closeStart) {
    const nl = text.indexOf('\n', p);
    const line = text.slice(p, nl);
    p = nl + 1;
    const ln = lineNo++;
    if (line.charCodeAt(0) === 35 || blankFrom(line, 0)) continue;
    const m = FM_LINE.exec(line);
    if (!m) return { error: `line ${ln} is not "key: value"` };
    const key = m[1];
    let raw = m[2] ?? '';
    let e = raw.length;
    while (e > 0) {
      const c = raw.charCodeAt(e - 1);
      if (c !== 32 && c !== 9) break;
      e--;
    }
    if (e !== raw.length) raw = raw.slice(0, e);
    if (!FM_KEYS.has(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if (v.error !== undefined) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: bodyStart === -1 ? '' : text.slice(bodyStart) };
}

// ------------------------------------------------------------------------------------------------ markdown

const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;

function isFenceClose(line) {
  return line.length >= 3 && line.charCodeAt(0) === 96 && line.charCodeAt(1) === 96 && line.charCodeAt(2) === 96 && blankFrom(line, 3);
}

function isHr(line) {
  const c = line.charCodeAt(0);
  return (c === 45 || c === 42) && line.length >= 3 && line.charCodeAt(1) === c && line.charCodeAt(2) === c && blankFrom(line, 3);
}

function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : { depth: m[1].length, text: m[2] };
}

/** Whether a line ends a paragraph: blank, a fence, a heading or a thematic break. */
function endsParagraph(line) {
  const c = line.charCodeAt(0);
  if (line.length === 0) return true;
  if (c === 32 || c === 9) return blankFrom(line, 1);
  if (c === 96) return line.charCodeAt(1) === 96 && line.charCodeAt(2) === 96 && FENCE_OPEN.test(line);
  if (c === 35) return headingOf(line) !== null;
  if (c === 45 || c === 42) return isHr(line);
  return false;
}

/** A bullet item's text ("- x" or "* x"), or null. */
function bulletOf(line) {
  const c = line.charCodeAt(0);
  if ((c === 45 || c === 42) && line.charCodeAt(1) === 32) {
    // The reference's dot rejects line separators. CR and LF were handled before this scan.
    const rest = line.slice(2);
    return LINE_TERM.test(rest) ? null : rest;
  }
  return null;
}

const LINE_TERM = /[\u2028\u2029]/;

/** An ordered item's [number text, item text], or null: /^(\d{1,9})\. (.*)$/. */
function orderedOf(line) {
  let i = 0;
  const n = line.length;
  while (i < n && i < 10) {
    const c = line.charCodeAt(i);
    if (c < 48 || c > 57) break;
    i++;
  }
  if (i === 0 || i > 9) return null;
  if (line.charCodeAt(i) !== 46 || line.charCodeAt(i + 1) !== 32) return null;
  const rest = line.slice(i + 2);
  if (LINE_TERM.test(rest)) return null;
  return [line.slice(0, i), rest];
}

/** /^ {2,}\S/ */
function isContinued(line) {
  if (line.charCodeAt(0) !== 32 || line.charCodeAt(1) !== 32) return false;
  let i = 2;
  while (line.charCodeAt(i) === 32) i++;
  return i < line.length && !isWs(line.charCodeAt(i));
}

const ESCAPABLE = new Uint8Array(128);
for (const ch of '\\`*_[]()#+-.!>') ESCAPABLE[ch.charCodeAt(0)] = 1;
const isEscapable = (c) => c < 128 && ESCAPABLE[c] === 1;

/** First index of `**` from `from`, outside an escape, or -1. */
function findDoubleStar(s, from) {
  const end = s.indexOf('**', from);
  if (end < 0 || s.lastIndexOf('\\', end) < from) return end;
  return findEscapedDelimiter(s, '**', from);
}

/** First index of `]` from `from`, outside an escape, or -1. */
function findClose(s, from) {
  const end = s.indexOf(']', from);
  if (end < 0 || s.lastIndexOf('\\', end) < from) return end;
  return findEscapedDelimiter(s, ']', from);
}

function findSingleStar(s, from) {
  const end = s.indexOf('*', from);
  if (end < 0) return end;
  if (s.lastIndexOf('\\', end) < from && s.charCodeAt(end + 1) !== 42) return end;
  return findEscapedDelimiter(s, '*', from);
}

function findEscapedDelimiter(s, mark, from) {
  for (let i = from; i < s.length; i++) {
    if (s.charCodeAt(i) === 92 && isEscapable(s.charCodeAt(i + 1))) {
      i++;
    } else if (s.startsWith(mark, i)) {
      if (mark === '*' && s.charCodeAt(i + 1) === 42) i++;
      else return i;
    }
  }
  return -1;
}

const INLINE_MARK = /[\\`*[&<>"']/g;

/** `s` rendered inline. `link(target)` returns the resolved, HTML-escaped href. */
function inline(s, link) {
  let parts;
  let run = 0;
  let from = 0;
  for (;;) {
    // Recursive calls also use this regexp. Resume at the outer call's own cursor.
    INLINE_MARK.lastIndex = from;
    if (!INLINE_MARK.test(s)) {
      if (parts === undefined) return s;
      parts.push(s.slice(run));
      return parts.join('');
    }
    const i = INLINE_MARK.lastIndex - 1;
    const c = s.charCodeAt(i);
    let replacement;
    from = i + 1;
    if (c === 92) {
      const next = s.charCodeAt(from);
      if (!isEscapable(next)) continue;
      replacement = escCode(next, s[from++]);
    } else if (c === 96) {
      const end = s.indexOf('`', from);
      if (end <= from) continue;
      replacement = '<code>' + esc(s.slice(from, end)) + '</code>';
      from = end + 1;
    } else if (c === 42) {
      if (s.charCodeAt(from) === 42) {
        const end = findDoubleStar(s, ++from);
        if (end <= from) continue;
        replacement = '<strong>' + inline(s.slice(from, end), link) + '</strong>';
        from = end + 2;
      } else {
        const end = findSingleStar(s, from);
        if (end <= from) continue;
        replacement = '<em>' + inline(s.slice(from, end), link) + '</em>';
        from = end + 1;
      }
    } else if (c === 91) {
      const labelEnd = findClose(s, from);
      if (labelEnd < 0 || s.charCodeAt(labelEnd + 1) !== 40) continue;
      const end = s.indexOf(')', labelEnd + 2);
      if (end <= labelEnd + 2) continue;
      const target = s.slice(labelEnd + 2, end);
      if (WS_TEST.test(target)) continue;
      replacement = '<a href="' + link(target) + '">' + inline(s.slice(from, labelEnd), link) + '</a>';
      from = end + 1;
    } else {
      replacement = escCode(c, s[i]);
    }
    (parts ??= []).push(s.slice(run, i), replacement);
    run = from;
  }
}

const WS_TEST = /\s/;

/** `src` rendered: { html, toc, excerpt }. `slug` is the build's memoised slug rule. */
function renderMarkdown(src, link, slug) {
  const lines = src.split('\n');
  const L = lines.length;
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  let i = 0;
  let pos = 0; // source offset at the start of lines[i]
  while (i < L) {
    const line = lines[i];
    const startPos = pos;
    pos += line.length + 1;
    const c = line.charCodeAt(0);
    if (line.length === 0 || ((c === 32 || c === 9) && blankFrom(line, 1))) {
      i++;
      continue;
    }
    if (c === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const lang = fence[1];
        const start = pos;
        i++;
        while (i < L && !isFenceClose(lines[i])) pos += lines[i++].length + 1;
        let body = src.slice(start, pos);
        if (i < L) pos += lines[i].length + 1;
        // An unclosed fence gives each remaining split line a newline, including an empty final line.
        else if (start <= src.length) body += '\n';
        i++;
        blocks.push(`<pre><code${lang === '' ? '' : ` class="language-${esc(lang)}"`}>${esc(body)}</code></pre>\n`);
        continue;
      }
    }
    if (c === 35) {
      const h = headingOf(line);
      if (h !== null) {
        const id = uniqueSlug(slug(h.text), ids);
        const ih = inline(h.text, link);
        blocks.push(`<h${h.depth} id="${id}">${ih}</h${h.depth}>\n`);
        if (h.depth === 2 || h.depth === 3) toc.push({ level: h.depth, id, html: ih });
        i++;
        continue;
      }
    }
    if ((c === 45 || c === 42) && isHr(line)) {
      blocks.push('<hr>\n');
      i++;
      continue;
    }
    if (c === 62) {
      const body = [];
      pos = startPos;
      while (i < L && lines[i].charCodeAt(0) === 62) {
        const l = lines[i++];
        pos += l.length + 1;
        const t = trimST(l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1));
        if (t !== '') body.push(t);
      }
      blocks.push(body.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inline(body.join('\n'), link)}</p>\n</blockquote>\n`);
      continue;
    }
    const bullet = c === 45 || c === 42 ? bulletOf(line) : null;
    const ordered = c >= 48 && c <= 57 ? orderedOf(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items = [];
      pos = startPos;
      while (i < L) {
        const l = lines[i];
        let item;
        if (isOrdered) {
          const m = orderedOf(l);
          item = m === null ? null : m[1];
        } else item = bulletOf(l);
        if (item !== null) {
          items.push(trimST(item));
          pos += l.length + 1;
          i++;
        } else if (isContinued(l)) {
          items[items.length - 1] += `\n${trimST(l)}`;
          pos += l.length + 1;
          i++;
        } else break;
      }
      const start = isOrdered ? Number(ordered[0]) : 1;
      let s = isOrdered ? (start !== 1 ? `<ol start="${start}">\n` : '<ol>\n') : '<ul>\n';
      for (const it of items) s += `<li>${inline(it, link)}</li>\n`;
      blocks.push(`${s}</${isOrdered ? 'ol' : 'ul'}>\n`);
      continue;
    }
    // Copy source spans between trimmed lines. Inline constructs can cross those line breaks.
    let trimmed = '';
    let pending = startPos;
    const first = trimST(line);
    if (first !== line) {
      trimmed = first;
      pending = pos - 1;
    }
    i++;
    while (i < L && !endsParagraph(lines[i])) {
      const next = lines[i++];
      const t = trimST(next);
      if (t !== next) {
        trimmed += src.slice(pending, pos) + t;
        pending = pos + next.length;
      }
      pos += next.length + 1;
    }
    const text = trimmed + src.slice(pending, pos - 1);
    const ph = inline(text, link);
    if (excerpt === null) excerpt = ph;
    blocks.push(`<p>${ph}</p>\n`);
  }
  return { html: blocks.join(''), toc, excerpt: excerpt ?? '' };
}

// ------------------------------------------------------------------------------------------------ templates

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;
const INCLUDE_DEPTH = 8;

class TemplateError extends Error {}

function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

// A scope is { vars, parent }: a path's first name comes from the nearest scope that owns it.
const hasOwn = Object.hasOwn;

function resolveName(scope, name) {
  let s = scope;
  while (s !== null) {
    if (hasOwn(s.vars, name)) return s.vars[name];
    s = s.parent;
  }
  return undefined;
}

function lookup(scope, path) {
  let v = resolveName(scope, path[0]);
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

/**
 * The names a node list reads from the scope it is rendered in (its free names), as a Set. `inc(name)` gives the free
 * names of an included template (a superset is fine: it only splits the memo more finely).
 */
function freeNames(nodes, inc, out, bound) {
  for (const n of nodes) {
    switch (n.kind) {
      case 'var':
      case 'raw':
        if (!bound.has(n.path[0])) out.add(n.path[0]);
        break;
      case 'if':
        if (!bound.has(n.path[0])) out.add(n.path[0]);
        freeNames(n.then, inc, out, bound);
        if (n.else !== null) freeNames(n.else, inc, out, bound);
        break;
      case 'for': {
        if (!bound.has(n.path[0])) out.add(n.path[0]);
        const b2 = new Set(bound);
        b2.add(n.name);
        b2.add('loop');
        freeNames(n.body, inc, out, b2);
        break;
      }
      case 'include':
        for (const f of inc(n.name)) if (!bound.has(f)) out.add(f);
        break;
    }
  }
  return out;
}

/** Names whose value changes for every page, so a memo keyed on them never hits. */
const VOLATILE = new Set(['page', 'loop', 'pager']);

/**
 * The parsed templates compiled to render functions (scope, depth) => string. Each include and for node is memoised
 * on the values of its free names when those values repeat across renders (the memo lives as long as this build).
 */
function compileTemplates(parsed) {
  // Free names of each template, to a fixpoint (includes may recurse).
  const free = new Map();
  for (const name of parsed.keys()) free.set(name, new Set());
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, nodes] of parsed) {
      const f = freeNames(nodes, (n) => free.get(n) ?? [], new Set(), new Set());
      const old = free.get(name);
      if (f.size !== old.size) {
        free.set(name, f);
        changed = true;
      }
    }
  }
  const incFree = (n) => free.get(n) ?? [];
  const compiled = new Map();
  const getCompiled = (name) => compiled.get(name);

  function memoize(fn, names) {
    // names: the free names the node reads; the memo is keyed on depth and their values.
    const k = names.length;
    if (k > 3) return fn;
    for (const nm of names) if (VOLATILE.has(nm)) return fn;
    const memo = new Map();
    if (k === 0) {
      return (scope, depth) => {
        let r = memo.get(depth);
        if (r === undefined) {
          r = fn(scope, depth);
          memo.set(depth, r);
        }
        return r;
      };
    }
    if (k === 1) {
      const a = names[0];
      return (scope, depth) => {
        let m = memo.get(depth);
        if (m === undefined) memo.set(depth, (m = new Map()));
        const va = resolveName(scope, a);
        let r = m.get(va);
        if (r === undefined) {
          r = fn(scope, depth);
          m.set(va, r);
        }
        return r;
      };
    }
    return (scope, depth) => {
      let m = memo.get(depth);
      if (m === undefined) memo.set(depth, (m = new Map()));
      for (let i = 0; i < k - 1; i++) {
        const v = resolveName(scope, names[i]);
        let next = m.get(v);
        if (next === undefined) m.set(v, (next = new Map()));
        m = next;
      }
      const v = resolveName(scope, names[k - 1]);
      let r = m.get(v);
      if (r === undefined) {
        r = fn(scope, depth);
        m.set(v, r);
      }
      return r;
    };
  }

  function compileList(nodes) {
    const fns = nodes.map(compileNode);
    // Adjacent constant text merged; a list of one function is that function.
    const parts = [];
    for (const f of fns) {
      if (typeof f === 'string' && parts.length > 0 && typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] += f;
      else parts.push(f);
    }
    if (parts.length === 0) return () => '';
    if (parts.length === 1) {
      const p = parts[0];
      return typeof p === 'string' ? () => p : p;
    }
    if (parts.length === 2) {
      const [a, b] = parts;
      if (typeof a === 'string') return (s, d) => a + b(s, d);
      if (typeof b === 'string') return (s, d) => a(s, d) + b;
      return (s, d) => a(s, d) + b(s, d);
    }
    const n = parts.length;
    return (s, d) => {
      let out = '';
      for (let i = 0; i < n; i++) {
        const p = parts[i];
        out += typeof p === 'string' ? p : p(s, d);
      }
      return out;
    };
  }

  function compileNode(n) {
    switch (n.kind) {
      case 'text':
        return n.text;
      case 'var': {
        const path = n.path;
        if (path.length === 1) {
          const a = path[0];
          return (s) => esc(textOf(resolveName(s, a)));
        }
        return (s) => esc(textOf(lookup(s, path)));
      }
      case 'raw': {
        const path = n.path;
        return (s) => textOf(lookup(s, path));
      }
      case 'if': {
        const path = n.path;
        const not = n.not;
        const th = compileList(n.then);
        const el = n.else === null ? null : compileList(n.else);
        return (s, d) => {
          const v = truthy(lookup(s, path));
          if (v !== not) return th(s, d);
          return el === null ? '' : el(s, d);
        };
      }
      case 'for': {
        const path = n.path;
        const name = n.name;
        const body = compileList(n.body);
        const fn = (s, d) => {
          const xs = lookup(s, path);
          if (!Array.isArray(xs)) return '';
          let out = '';
          xs.forEach((x, k) => {
            const vars = { [name]: x, loop: { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length } };
            out += body({ vars, parent: s }, d);
          });
          return out;
        };
        return memoize(fn, [...freeNames([n], incFree, new Set(), new Set())]);
      }
      case 'include': {
        const name = n.name;
        if (!parsed.has(name)) return '';
        const fn = (s, d) => (d < INCLUDE_DEPTH ? getCompiled(name)(s, d + 1) : '');
        return memoize(fn, [...incFree(name)]);
      }
    }
    return '';
  }

  for (const [name, nodes] of parsed) compiled.set(name, compileList(nodes));
  return compiled;
}

// ------------------------------------------------------------------------------------------------ the build

const RESERVED = ['posts', 'tags', 'page'];

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path) => {
  const k = path.lastIndexOf('/');
  return k === -1 ? '' : path.slice(0, k);
};

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** The output tree makefun-site 1.0.0 builds for `input`. */
export function run(input) {
  const slugMemo = new Map();
  const slug = (text) => {
    let r = slugMemo.get(text);
    if (r === undefined) {
      r = slugRaw(text);
      slugMemo.set(text, r);
    }
    return r;
  };

  // Templates, in code-unit order of their names; one that does not parse is reported.
  const report = [];
  const parsed = new Map();
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      parsed.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const base = input.site.base_url.replace(/\/+$/, '');

  // 1. Sources and statics, by path.
  const files = [...input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  let sources = [];
  const statics = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) {
      const c = f.content;
      sources.push({ path: f.path, text: c.indexOf('\r') === -1 ? c : c.replace(/\r\n?/g, '\n') });
    } else statics.push({ path: f.path, content: f.content });
  }

  // 2. Front matter.
  const kept = [];
  for (const s of sources) {
    const fm = parseFrontMatter(s.text);
    if (fm.error !== undefined) {
      report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = s.path.startsWith('tags/') ? 'tags' : s.path.startsWith('page/') ? 'page' : undefined;
    if (own !== undefined) {
      report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !hasOwn(s.data, 'date')) {
      report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!parsed.has(layout)) {
      report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }
  sources = kept;

  // 3. Permalinks.
  const taken = new Map();
  const bySource = new Map();
  for (const s of sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let t = taken.get(dir);
    if (t === undefined) taken.set(dir, (t = new Set(dir === '' ? RESERVED : [])));
    const sl = uniqueSlug(s.data.slug ?? slug(s.data.title), t);
    s.slug = sl;
    s.outDir = dir === '' ? sl : `${dir}/${sl}`;
    s.url = `${base}/${s.outDir}/`;
    bySource.set(s.path, s);
  }

  // 4. Markdown.
  const staticPaths = new Set(statics.map((f) => f.path));
  const broken = new Set();
  for (const s of sources) {
    const dir = dirOf(s.path);
    const link = (target) => {
      const c = target.charCodeAt(0);
      if (c === 47 || c === 35 || SCHEME.test(target)) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = rel === '' ? null : resolvePath(dir, rel);
      if (path !== null) {
        const t = bySource.get(path);
        if (t !== undefined) return `${t.url}${frag}`;
        if (staticPaths.has(path)) return `${base}/${path}${frag}`;
      }
      broken.add(`broken-link ${s.path} -> ${target}`);
      return target;
    };
    const hrefs = new Map();
    const escapedLink = (target) => {
      let url = hrefs.get(target);
      if (url === undefined) {
        url = esc(link(target));
        hrefs.set(target, url);
      }
      return url;
    };
    const md = renderMarkdown(s.body, escapedLink, slug);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }

  // 5. Collections.
  const posts = sources.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  for (let k = 0; k < posts.length; k++) {
    const p = posts[k];
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  }

  // 6. Tags.
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const out = [];
    for (const name of s.data.tags ?? []) {
      const sl = slug(name);
      if (seen.has(sl)) continue;
      seen.add(sl);
      out.push(name);
    }
    return out;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const sl = slug(name);
      let tag = bySlug.get(sl);
      if (tag === undefined) bySlug.set(sl, (tag = { name, slug: sl, url: `${base}/tags/${sl}/`, posts: [] }));
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of sources) {
    if (!s.post) s.tagRefs = ownTags(s).map((name) => bySlug.get(slug(name)) ?? { name, slug: slug(name), url: '', posts: [] });
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));

  // 7. Layouts.
  const compiled = compileTemplates(parsed);
  const cardOf = (s) => ({
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: s.post ? readingMinutes(s.body) : 0,
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  });
  const cards = new Map();
  for (const p of posts) {
    const card = cardOf(p);
    const { title, url, date, date_long } = card;
    p.link = { title, url, date, date_long };
    cards.set(p, card);
  }
  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => cards.get(p));
  const output = {};
  const render = (name, vars) => {
    const fn = compiled.get(name);
    if (fn === undefined) return null;
    return fn({ vars: { site, tags: allTags, recent, ...vars }, parent: null }, 0);
  };
  for (const s of sources) {
    const card = s.post ? cards.get(s) : cardOf(s);
    const page = {
      ...card,
      slug: s.slug,
      content: s.html,
      toc: s.toc,
      newer: s.newer?.link ?? null,
      older: s.older?.link ?? null,
      is_post: s.post,
    };
    if (!s.post) {
      // Most page layouts never read this field. Keep it an own property for any layout that does.
      Object.defineProperty(page, 'reading_minutes', {
        get: () => readingMinutes(s.body),
      });
    }
    output[`${s.outDir}/index.html`] = render(s.layout, { page });
  }
  const per = input.site.per_page;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${base}/` : `${base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => cards.get(p)) } });
    if (html !== null) output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (hasOwn(output, f.path)) report.push(`shadowed ${f.path}: a built page has its path`);
    else output[f.path] = f.content;
  }

  // 8. The report.
  const lines = [...report, ...broken].sort(byCodeUnits);
  let pageCount = 0;
  for (const s of sources) if (!s.post) pageCount++;
  lines.push(`built ${pageCount} pages, ${posts.length} posts, ${tags.length} tags and ${statics.length} static files`);
  output['build-report.txt'] = `${lines.join('\n')}\n`;
  return output;
}
