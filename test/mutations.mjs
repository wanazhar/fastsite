// mutational differential fuzz: reference build vs solve.js run on generated sites with random edits
import { compare } from './compare.mjs';

const K = process.env.K;
const { build } = await import(K + '/program/generator/vendor/makefun-site/index.js');
const { run } = await import(process.env.SOLVE);
const { generate } = await import(K + '/program/generator/subject/sites.mjs');
const { streamFor } = await import(K + '/program/generator/rng.ts');
const { createHash } = await import('node:crypto');
let seedv = 12345;
const rnd = () => { seedv = (Math.imul(seedv, 1103515245) + 12345) & 0x7fffffff; return seedv / 0x80000000; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TOK = ['\\', '\\*', '*', '**', '`', '[', ']', '(', ')', '](', '[a](b c)', '[x](./x.md)', '[y](../a.md#f)', '#', '# ', '###### ', '####### x', '---', '***', '> ', '>', '- ', '* ', '1. ', '0123456789. ', '12. ', '  ', '\t', '\n', '\n\n', '\r\n', '\r', '```', '```js\n', '```c++ \n', '\u2028', '\u00a0', '\ufeff', '&', '<', '>', '"', "'", 'é', 'ﬁ', '東京', '\u0301', '{{ page.title }}', '{%', '%}', '_', '!', 'x', ' ', 'draft: true', 'title: ', 'tags: [a, b]', 'slug: a-b', 'layout: page', 'date: 2020-02-30', 'date: 2020-02-29'];
const TTOK = ['{{ site.title }}', '{{{ page.content }}}', '{% if page %}', '{% else %}', '{% endif %}', '{% for x in recent %}', '{% endfor %}', '{% include "card" %}', '{% include "footer" %}', '{% include "loopy" %}', '{{ loop.index }}', '{{ x.title }}', '{{ page.tags.length }}', '{{ tags }}', '{{', '}}', '{%', '%}', '\n', '  {% if not posts %}  \n', '{{ bad-path }}', '{% for loop in tags %}{{ loop.name }}{% endfor %}', '{{ page.toc }}', '{{ recent.0 }}', '{% if tag %}{{ tag.count }}{% endif %}', '{{ constructor }}', '{{ page.constructor }}', '{{ page.title.length }}', '{% for x in page.title %}a{% endfor %}', '{% if toString %}T{% endif %}', '{{ tags.length }}'];
function mutate(str, toks, k) {
  for (let j = 0; j < k; j++) {
    const p = Math.floor(rnd() * (str.length + 1));
    const r = rnd();
    if (r < 0.7) str = str.slice(0, p) + pick(toks) + str.slice(p);
    else str = str.slice(0, p) + str.slice(p + Math.floor(rnd() * 5));
  }
  return str;
}
let bad = 0, total = 0;
const N = Number(process.argv[2] || 10);
for (let t = 0; t < N; t++) {
  seedv = 777 + t;
  const seed = createHash('sha256').update('mut' + t).digest('hex');
  const input = JSON.parse(JSON.stringify(generate(streamFor(seed, 'case', t % 3), t % 3)));
  input.files = input.files.slice(0, 80);
  for (const f of input.files) if (rnd() < 0.6) f.content = mutate(f.content, TOK, 1 + Math.floor(rnd() * 12));
  input.templates.loopy = '{% include "loopy" %}x{{ page.title }}';
  for (const k of Object.keys(input.templates)) if (rnd() < 0.3) input.templates[k] = mutate(input.templates[k], TTOK, 1 + Math.floor(rnd() * 3));
  if (rnd() < 0.3) input.files.push({ path: 'posts/' + pick(['a', 'b']) + '.md', content: mutate('---\ntitle: X\ndate: 2020-01-01\n---\nbody', TOK, 3) });
  total++;
  bad += compare(build, run, JSON.stringify(input), 'mutation ' + t, true);
}
console.log('done', total, 'bad', bad);
if (bad > 0) process.exitCode = 1;
