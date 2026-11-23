#!/bin/bash
# usage: bench.sh <bot dir> <runs>
K=${K:?set K to the unpacked kit}; N=${NODE:-node}
OUT=$(mktemp -d); TIMEFORMAT='%U %S'
for i in $(seq 1 ${2:-7}); do { time taskset -c 0 env MAKEFUN_INPUT_DIR=$K/practice/input MAKEFUN_OUTPUT_DIR=$OUT $N $1/main.ts ; } 2>&1; done | python3 -c "import sys,statistics as st;v=[float(a)+float(b) for a,b in (l.split() for l in sys.stdin if l.strip())];print(\"cpu median %.3f mean %.3f min %.3f\"%(st.median(v),st.mean(v),min(v)))"
$N -e "
const fs=require('fs');const a=JSON.parse(fs.readFileSync('$OUT/answers.json'));const e=JSON.parse(fs.readFileSync('$K/practice/reference/expected.json'));
function c(v){if(Array.isArray(v))return '['+v.map(c).join(',')+']';if(v!==null&&typeof v==='object'){return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+c(v[k])).join(',')+'}'}return JSON.stringify(v)}
console.log('correct', e.cases.every((x,i)=>c(x.output)===c(a[i])))"
