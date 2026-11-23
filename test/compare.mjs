function invoke(builder, input) {
  try {
    const output = builder(JSON.parse(input));
    return { output, json: JSON.stringify(output) };
  } catch (error) {
    return { error: error.name + ': ' + error.message };
  }
}

export function compare(build, run, input, fixture, allowErrors = false) {
  const expected = invoke(build, input);
  const actual = invoke(run, input);
  if (expected.error !== undefined || actual.error !== undefined) {
    if (allowErrors && expected.error === actual.error) return 0;
    console.error(fixture, 'reference error:', expected.error, 'entry error:', actual.error);
    return 1;
  }

  if (expected.json === actual.json) return 0;

  const refKeys = Object.keys(expected.output);
  const ourKeys = Object.keys(actual.output);
  for (let i = 0; i < Math.max(refKeys.length, ourKeys.length); i++) {
    if (refKeys[i] !== ourKeys[i]) {
      console.error(fixture, 'path order at', i, 'expected', refKeys[i], 'got', ourKeys[i]);
      return 1;
    }
    const key = refKeys[i];
    const a = expected.output[key];
    const b = actual.output[key];
    if (a !== b) {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      console.error(fixture, key, 'offset', i);
      console.error('  reference', JSON.stringify(a.slice(Math.max(0, i - 60), i + 60)));
      console.error('  entry    ', JSON.stringify(b.slice(Math.max(0, i - 60), i + 60)));
      return 1;
    }
  }
  console.error(fixture, 'serialized answer differs');
  return 1;
}
