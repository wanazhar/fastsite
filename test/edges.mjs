// Focused, deterministic differential tests. Both own-key order and file bytes matter.
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const kit = resolve(process.env.K);
const { build } = await import(pathToFileURL(join(kit, 'program/generator/vendor/makefun-site/index.js')));
const { run } = await import(pathToFileURL(resolve(process.env.SOLVE)));
const inspectPage = '{{ page.title }}|{{ page.date_long }}|{{ page.slug }}|{{ page.reading_minutes }}|{{ page.tags.length }}|{{{ page.excerpt }}}\n'
  + '{% for h in page.toc %}{{ h.level }}:{{ h.id }}:{{{ h.html }}}\n{% endfor %}'
  + '{% for t in page.tags %}{{ t.name }}:{{ t.url }}\n{% endfor %}{{{ page.content }}}'
  + '|{% if page.newer %}{{ page.newer.title }}{% endif %}|{% if page.older %}{{ page.older.title }}{% endif %}';
const templates = {
  page: inspectPage, post: inspectPage,
  index: '{{ pager.number }}|{{ pager.total }}|{{ pager.newer_url }}|{{ pager.older_url }}\n'
    + '{% for p in posts %}{{ p.title }}|{{ p.date }}|{{ p.reading_minutes }}|{{{ p.excerpt }}}\n{% endfor %}',
  tags: '{% for t in tags %}{{ t.name }}|{{ t.slug }}|{{ t.count }}|{{ t.url }}\n{% endfor %}',
  tag: '{{ tag.name }}|{{ tag.count }}\n{% for p in tag.posts %}{{ p.title }}|{{ p.url }}\n{% endfor %}',
};
const site = { title: 'Café & <"\'東京>', base_url: 'https://x.example/book///', per_page: 2, recent: 2 };
const source = (path, body = '', fields = 'title: Fixture') => ({ path, content: '---\n' + fields + '\n---\n' + body });
const file = (path, content) => ({ path, content });
let checked = 0;

function check(name, files, overrides = {}, settings = {}, replaceTemplates = false) {
  const input = {
    site: { ...site, ...settings },
    templates: replaceTemplates ? overrides : { ...templates, ...overrides },
    files,
  };
  const expected = build(input);
  const actual = run(input);
  const keys = Object.keys(expected);
  assert.deepEqual(Object.keys(actual), keys, name + ' paths and order');
  for (const key of keys) assert.equal(actual[key], expected[key], name + ' at ' + key);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), name + ' serialized bytes');
  checked++;
}

const lines = [
  '#', '# ', '#\t \t', '###### H ##\t ', '####### long', ' # indented', '#no-space', '### a\u2028b',
  '---', '--- \t', '----', ' --', '***', '***\t', '***\u2029', '___', '===',
  '> ', '>', '>\t', '> > nested', '>> x', '> \u00a0', '>\tx\t', '> \u2028>',
  '- ', '* \t', '+ x', '0. zero', '000000001. one', '0000000001. too long', '1) different',
  '- a\u2028', '* b\u2029tail', '2. a\u2029', '  item', '    \tstop', '  \u00a0stop',
  '```', '```  \t', '```c++', '```x-0_', '```bad.lang', ' ```', '```\u2028',
  '\t  ', '', ' \u00a0 ', '\u200b', '\u0085', '\t  inline <\"&>\'  \t',
];
const blocks = lines.flatMap((line, i) => [
  source('start-' + i + '.md', line + '\ntext\n\n' + line),
  source('paragraph-' + i + '.md', 'first\n' + line + '\nlast'),
  source('inside-' + i + '.md', '- item\n' + line + '\n\n```js\n' + line + '\n\n'),
]);
check('Markdown block boundaries and EOF', blocks);

const pieces = ['x ', '→🦋', '\ud801', ' ', '\n', '\t', '\u2028', '\u2029', '\u0085', '\u200b', '\u00a0', '**', '***', '*', '`', '``', '\\', '\\*', '\\!', '\\>', '\\q', '\\\\', '\\[', '\\]', '[', '](', ')', '[x](#f)', '[a](/q?x&y)', '&<>\'"', 'a_b'];
let state = 0x281f7c29;
const pick = (xs) => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return xs[(state >>> 0) % xs.length];
};
for (let batch = 0; batch < 24; batch++) {
  const files = [];
  for (let n = 0; n < 64; n++) {
    const fragments = Array.from({ length: 4 + n % 9 }, () => pick(pieces));
    const middle = fragments.join('');
    const inline = [
      middle, '**' + middle + '**', '[' + middle + '](/q?x&y)',
      '[**a** *b* `c` ' + middle + '](./not-here.md#fragment)',
      '`' + middle + '`', '*x*' + middle + '*y*',
      '[target](' + middle + ')', 'a\\' + middle + ' <&\'>',
    ][n % 8];
    files.push(source(n + '.md', 'prefix ' + inline + ' suffix\n\n## ' + inline));
  }
  check('inline delimiters batch ' + batch, files);
}

const valid = [
  'title: ""', 'title: "escaped \\"quote\\" with \\\\ slash"\t', 'title:  padded  \t',
  'title: Café 𝔘 Ｗｉｄｅ ﬁ e\u0301 \u{1d165} Łódź İstanbul', 'title: 東京', 'title: ①⁵ﬃＡ',
  'title: ' + 'a'.repeat(63) + ' b', 'title: ' + 'a'.repeat(64) + 'b',
  'title: z\n# comment: unknown\n \t\nsummary: ""\ntags: [\t \u00a0]\ndraft: false',
  'title: z\ndate: 1970-01-01\nslug: ' + 'a'.repeat(64),
  'title: z\ndate: 2000-02-29\ntags: [a, A, a!, 東京,  東京 ]',
  'title: z\ndate: 2099-12-31',
];
const invalid = [
  '', 'title:', 'title: \t', 'Title: x', 'title:\tx', 'title: x\u2028', 'title: [x]',
  'title: "x', 'title: "x\\q"', 'title: "x\\"', 'title: "x"q"',
  'title: x\ntitle: ', 'title: x\nconstructor: t', 'title: x\n__proto__: t', 'title: x\nlength: t',
  'title: x\nsummary:', 'title: x\ntags: one,two', 'title: x\ntags: [a,]', 'title: x\ntags: ["a"]',
  'title: x\ntags: [[a]]', 'title: x\ndraft: True', 'title: x\nlayout: no-layout',
  'title: x\nlayout: INVALID', 'title: x\nslug: two--gaps', 'title: x\nslug: ' + 'a'.repeat(65),
  ...['1969-12-31', '2100-01-01', '2023-02-29', '2024-02-30', '2099-11-31', '2020-00-02', '2020-12-00', '20-01-01', '2020-1-01', '2020-01-01\u00a0'].map((date) => 'title: x\ndate: ' + date),
];
const frontMatter = [...valid, ...invalid].flatMap((fields, i) => {
  const item = source('fm-' + i + '.md', '    body\n\n## 東京\n## 東京\n## untitled\n## Untitled 2\n## Tokyo', fields);
  return ['\n', '\r\n', '\r'].map((sep, j) => file(j + '/' + item.path, item.content.replaceAll('\n', sep)));
});
frontMatter.push(
  file('0.md', '\ufeff---\ntitle: X\n---'), file('1.md', '---\ntitle: X\n--- \n'),
  file('2.md', '---\nbad but no close'), file('3.md', '---\ntitle: X\n---'),
  source('tags/owned.md', 'body', 'title: x\ndraft: true'),
  source('page/owned.md', 'body', 'title: x\nlayout: unknown'),
  source('posts/no-date.md', 'body', 'title: x\ndraft: true'),
);
check('front matter, CRLF, dates, Unicode, and refusal precedence', frontMatter);

const whitespace = [
  ' ', '\t', '\v', '\f', '\r', '\r\n', '\n', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003',
  '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f',
  '\u205f', '\u3000', '\ufeff', '\u0085', '\u180e', '\u200b', '\u001c', '\u0000',
];
check('reading-minute boundaries and all whitespace classes', whitespace.flatMap((sep, i) =>
  [0, 1, 199, 200, 201, 399, 400, 401, 601].map((n) =>
    source(i + '/' + n + '.md', sep.repeat(2) + Array(n).fill('x').join(sep) + sep.repeat(2)))));

const links = [
  '#f', '/x.md', '//x.md', 'aA+0.-:x&y', '0bad:link', ':no', 'mailto:info@example.org',
  '../../tags.md#x#y', '../posts/a.md', 'a.md', './a.md', '././a.md', 'q//../a.md',
  '../../..', '.././../assets//f.txt#<&', '../../assets/f.txt/', '../q/../../tags.md',
  '../d/../x/../../../../tags.md', 'a.md?query', '../../assets/./f.txt', './', '.', './a.md#',
  '../../constructor', '../../__proto__', '../../toString', '../../length',
  'x\u0085y', 'x\u00a0y', 'x\u200by', 'x\u2028y', 'x\\)',
];
check('link resolution, stable ordering, collisions, pagination, reserved paths and prototype keys', [
  source('docs/guide/index.md', links.map((target) => '[L](' + target + ')').join('\n') + '\n\n[x](a.md) [x](bad) [x](bad)'),
  source('docs/guide/a.md', '', 'title: a'),
  source('docs/guide/a.md', '', 'title: duplicate a'),
  source('tags.md', 'body', 'title: tags\ntags: [Only pages]'),
  source('x.md', 'body', 'title: page'),
  source('y.md', 'body', 'title: posts'),
  ...['A', 'a', 'ä', '東京', 'b', 'B'].map((p, i) => source('posts/' + p + '.md', '',
    'title: ' + ['Item', 'item', 'item 2', 'item', 'Item 3', 'item'][i] + '\ndate: ' + (i < 4 ? '2024-02-29' : '2023-02-28')
    + '\ntags: ' + ['[A, a, B]', '[c, B]', '[b, C]', '[東京, B, c]', '[]', '[C++]'][i])),
  file('assets/f.txt', 'static\r\ntext'), file('assets/f.txt', 'shadowed'),
  file('index.html', 'shadowed'), file('build-report.txt', 'drop'),
  file('__proto__', 'ignored'), file('constructor', 'static'), file('toString', 'static'), file('length', 'static'),
  file('10', 'ten'), file('2', 'two'),
]);

const scope = '{% for p in recent %}'
  + '{% include "vars" %}{% include "cycle" %}'
  + '{% for p in p.tags %}{% include "vars" %}{% endfor %}'
  + '{% for __proto__ in p.tags %}{{ __proto__.name }}|{{ __proto__.__proto__ }}{% endfor %}'
  + '{% for constructor in p.tags %}{{ constructor.name }}|{{ constructor.toString }}{% endfor %}'
  + '{% for loop in p.tags %}{{ loop.name }}:{{ loop.length }}:{{ loop.index }}{% endfor %}'
  + '{% endfor %}{% include "absent" %}{% include "bad" %}{% include "d0" %}';
const scopeTemplates = {
  page: scope, post: scope, index: scope, tag: scope, tags: scope,
  vars: '{{ p.title }}|{{ p.name }}|{{ loop.index }}|{{ loop.first }}|{{ loop.last }}|{{ loop.length }}'
    + '|{{ constructor }}|{{ __proto__ }}|{{ toString }}|{{ length }}|{{ page.title.length }}|{{ page.tags.length }}'
    + '|{% if loop %}loop{% endif %}|{% if not page %}none{% else %}page{% endif %}',
  cycle: '{{ p.title }}:{{ loop.index }}{% include "cycle" %}',
  ...Object.fromEntries(Array.from({ length: 11 }, (_, i) =>
    ['d' + i, i + '{% include "vars" %}{% include "d' + (i + 1) + '" %}'])),
  bad: '{% else %}',
};
check('template memo scopes, loop shadowing, own properties and include depth', [
  source('page.md', 'a', 'title: Page'),
  source('posts/a.md', 'b', 'title: Post A\ndate: 2024-01-02\ntags: [Alpha, Beta]'),
  source('posts/b.md', 'c', 'title: Post B\ndate: 2024-01-01\ntags: [Gamma]'),
], scopeTemplates);
check('tokenization precedence, standalone tags, invalid paths and missing layouts', [
  source('only.md', '', 'title: title\nlayout: good'),
  source('refused.md', '', 'title: title\nlayout: bad'),
], {
  good: 'x\n \t{% include "ok" %}\t  \nA\n  {% include "ok" %}\r\n'
    + ' {% if not site.base_url %}\nempty\n{% else %}{{ site.base_url }}{% endif %}\n{single',
  ok: '{{ site.title }}{{{ site.title }}}',
  bad: '{% else %} {{ unterminated',
  bad2: '{% else %} {{ page.0 }}',
  bad3: '{% if ok %}{% else %}{% else %}{% endif %}',
  bad4: '{% if ok %}{% endfor %}',
  bad5: '{% for  x in recent %}{% endfor %}',
  bad6: '{% for x in recent %}',
  bad7: '{% not-a-tag %}',
  bad8: '{% include "BAD" %}',
}, { base_url: '/' }, true);

check('empty site and no optional layouts', [], {}, { base_url: '' }, true);
check('empty lists and value coercion', [], {
  index: '{{ site.title }}|{{{ site.title }}}|{{ site.title.length }}'
    + '|{% if posts %}a{% endif %}{% if not posts %}b{% endif %}|{{ posts.length }}'
    + '|{{ site.title.constructor }}{% if site.title.toString %}c{% endif %}',
}, { title: ['a&', ['b<', false, null], 0, null, {}] });
const sparse = [];
sparse[2] = 'hit';
check('sparse arrays through the exported API', [], {
  index: '{% for x in site.title %}{{ loop.index }}/{{ loop.length }}:{{ x }};{% endfor %}',
}, { title: sparse });
console.log('done', checked, 'focused sites, bad 0');
