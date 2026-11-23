// differential test: reference build vs solve.js run on generated sites
const K = process.env.K;
const { build } = await import(K + '/program/generator/vendor/makefun-site/index.js');
const { run } = await import(process.env.SOLVE);
const { generate } = await import(K + '/program/generator/subject/sites.mjs');
const { streamFor } = await import(K + '/program/generator/rng.ts');
const { createHash } = await import('node:crypto');
const N = Number(process.argv[2] || 30), start = Number(process.argv[3] || 0);
function canonical(v){ if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v!==null&&typeof v==='object'){const ks=Object.keys(v).sort();return `{${ks.map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;} return JSON.stringify(v);}
let bad=0;
for (let t=start;t<start+N;t++){
  const seed=createHash('sha256').update('fuzz'+t).digest('hex');
  for (let i=0;i<3;i++){
    const input=JSON.parse(JSON.stringify(generate(streamFor(seed,'case',i),i)));
    const a=canonical(JSON.parse(JSON.stringify(build(JSON.parse(JSON.stringify(input))))));
    const b=canonical(JSON.parse(JSON.stringify(run(input))));
    if(a!==b){bad++; const A=JSON.parse(a),B=JSON.parse(b); for(const k of new Set([...Object.keys(A),...Object.keys(B)])) if(A[k]!==B[k]){console.log('DIFF seed',t,'case',i,k); const x=A[k]||'',y=B[k]||''; let p=0; while(x[p]===y[p])p++; console.log(' ref:',JSON.stringify(x.slice(Math.max(0,p-80),p+80))); console.log(' me :',JSON.stringify(y.slice(Math.max(0,p-80),p+80))); break;}}
  }
}
console.log('done', N*3, 'cases, bad', bad);
