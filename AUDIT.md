# makefun-site 1.0.0 parity audit

Compared `solve.js` against the kit's `program/generator/vendor/makefun-site/index.js` and its four libraries, and read all of `program/generator/subject/sites.mjs`. The house driver is the oracle for the serialized answer.

The generator draws all three size bands with shuffled file order. Its less common inputs include quoted, respelled and Unicode titles, explicit slugs, empty and duplicate tag lists, all 15 refusal edits, missing front matter openers, CRLF Markdown, alternate layouts, and variable or repeated partials in the head, footer and layouts. Bodies can combine inline marks on one word, wrap constructs across lines, reuse heading text, append closing hashes, place thematic breaks against paragraphs, mix bare syntax with supported blocks, and link to drafts, refused pages, static assets or missing sources. The same code paths handle each draw.

| Risk | Handling and regression coverage |
| --- | --- |
| Template loops over sparse arrays through the JavaScript API | The old loop rendered holes as items. The renderer uses the reference's array iteration and preserves the original index, length, first and last fields. Array interpolation uses the reference's map and join semantics. A direct API fixture reproduced the mismatch on HEAD. It printed `1/3:;2/3:;3/3:hit;` where the reference printed `3/3:hit;`. The grader's JSON arrays are dense. |
| Silent changes in output property order and test exit status | Both differential suites compare exact serialized JSON and return a failing status on a mismatch. The added shell suite compares whole driver files against the house driver and against a second run. It also checks the empty array path. |
| Markdown block boundaries, trailing lines and excerpts | Paragraphs reuse original spans between trimmed lines and retain newlines inside inline constructs. Fences preserve the added newline for every body line, even a terminal empty split line in an unclosed fence. Tests put blank lines, headings, thematic breaks, fences, quotes and lists at block boundaries, within paragraphs, and at EOF. They include tabs, non-ASCII whitespace and Unicode line separators. |
| Inline rule ordering and HTML escaping | One scan finds escapes, backticks, stars, brackets and HTML characters. Failed delimiters remain literal, failed strong openers advance by both stars, and recursive scans restore their own cursor. Fenced and inline code escape raw text. Link targets follow the reference's whitespace and closing-parenthesis rules. Focused fuzz covers nested spans, escaped delimiters, malformed links, entities, line separators and lone UTF-16 surrogates. |
| Front matter, line endings and refusal precedence | Markdown normalizes CR, CRLF and LF before parsing. Static content preserves its line endings. Front matter looks for the exact closing line before checking individual keys. Tests cover missing and malformed delimiters, comments, blanks, case, duplicate or unknown keys, quoted escapes, tag grammar, draft/layout order, reserved directories, missing post dates and Gregorian range and leap-day boundaries. |
| Slug, date, tag and pagination semantics | Slugs use Node 22 NFKD, remove combining marks before ASCII filtering, trim at 64 code units and allocate collision suffixes in source order. Tags preserve the first name seen in sorted posts, deduplicate by slug and sort by count then slug. Tests exercise compatibility characters, all-non-ASCII titles, repeated heading IDs, colliding suffixes, tag aliases and page-only tags. Neighbour records reuse date text and expose the same four fields. Fixtures cover no posts, final partial pagination, same-date posts and code-unit order. |
| Reading time for custom layouts and Unicode whitespace | Reading time matches whole groups of 200 reference words. Layouts can still read the own property on ordinary pages, and the count is computed on access. The focused suite checks thresholds on both sides of 200, 400 and 600 with ECMAScript whitespace and similar characters that are ordinary word characters. |
| Resolution and broken-link reporting | The href cache lives in a single source. It preserves scheme, root and anchor checks, the first fragment split, dot and empty segments, root-climb refusal, lookup of the actual kept source or static file, and one report per source and target. Tests include repeated hits and misses, query punctuation and Unicode whitespace in targets, duplicate source paths, and static shadowing. |
| Template scope, parsing and memoization | Tokenization retains precedence over structural parse errors and only strips standalone control tags with spaces or tabs beside them. Lookup requires own properties and blocks traversal through primitives. Memoization includes free names and include depth, and loop variables shadow outer scopes. Tests cover nested and recursive includes, invalid or missing templates, empty arrays, raw and escaped interpolation, and names including `constructor`, `__proto__`, `toString` and `length`. |
| Stable sorting, output collisions and report | Source sorting uses stable code-unit comparison. Later references to an equal path see the last kept source. Existing output paths shadow static files, numeric object keys keep JavaScript enumeration order, and the report is sorted with its count line last. The focused fixtures and strict JSON comparison cover these cases. |

The focused suite is `test/extra.sh`. Random mutation inputs use a deterministic PRNG, and all production caches are local to one build or source. The entry reads the documented input and output directory overrides.

## Practice CPU

Measured complete processes with Node 22.23.5 on CPU 1. The baseline is an untouched copy of HEAD `71fc0cc`. Runs alternated old and new. All runs used the same practice input and output directory. Medians include user and system CPU, with 15 runs per entry.

| Entry | Median CPU |
| --- | ---: |
| HEAD `71fc0cc` | 653.195 ms |
| Working tree | 411.411 ms |

The initial CPU profile put Markdown block and inline scans, word counting, and garbage collection among the largest stacks. The final entry reuses Markdown spans, reads delimiters with native string searches, joins rendered fragments once, counts in word groups, and defers counts for pages until a template asks for them. The driver keeps native JSON parsing and per-case serialization. Property-by-property serialization was slower in screening. The driver uses synchronous loading of the ES module and caps V8 at optimization tier 1 before loading it.

Flag screening used the same practice set. With the same tuned solver and plain JavaScript driver in the screening run, medians were 553 ms with the house GC flag alone, 420 ms with tier 1, 409 ms with tier 2, and 461 ms with Sparkplug disabled. The combined final candidate took 416 ms in the five-run screen with the house GC flag and tier 1, and 417 ms with tier 1 and default GC. Semi-space tuning, single-threaded GC, disabling the memory reducer, eager Sparkplug, early RegExp compilation, and enabling Maglev were also measured and gave no repeatable gain over the chosen combination. The final paired run used the required regular `main.ts` entrypoint.

## Verification

- `node test/generated.mjs 300` checked 900 sites and reported `bad 0`.
- `node test/mutations.mjs 3000` reported `bad 0`.
- `test/extra.sh` checked 33 focused sites. Both practice runs matched the house output byte for byte, and the empty input wrote `[]`.
- The kit scorer reported all three practice cases passed.
