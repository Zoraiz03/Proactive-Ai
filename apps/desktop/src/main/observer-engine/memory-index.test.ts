import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryChunks, memorySymbols } from '../../shared/memory-index.ts';

test('chunks cover every line with exactly five lines of overlap and stable ranges', () => {
  const lines = Array.from({ length: 81 }, (_, i) => `line ${i + 1}`);
  const chunks = memoryChunks(lines.join('\r\n'));
  assert.deepEqual(chunks.map(c => [c.index, c.lineStart, c.lineEnd]), [[0,1,40], [1,36,75], [2,71,81]]);
  assert.equal(chunks[0].text.split('\n').slice(-5).join('\n'), chunks[1].text.split('\n').slice(0,5).join('\n'));
  assert.deepEqual(memoryChunks(''), []);
  assert.equal(memoryChunks('x'.repeat(200000)).length, 1);
  assert.equal(memoryChunks(lines.slice(0,40).join('\n')).length, 1);
});

test('symbol outline supports declarations, repeated names, and bounded ranges', () => {
  const content = 'export function run() {}\nclass Box {}\nconst value = 2;\ninterface Item {}\ntype ID = string;\nfunction run() {}';
  assert.deepEqual(memorySymbols(content, 'typescript').map(s => [s.name,s.kind,s.lineStart]), [
    ['run','function',1], ['Box','class',2], ['value','const',3], ['Item','interface',4], ['ID','type',5], ['run','function',6],
  ]);
  assert.equal(memorySymbols('async def run():\n    pass', 'python')[0].kind, 'def');
  assert.deepEqual(memorySymbols('/*\nclass Fake {}\n*/\n// function fake() {}', 'javascript'), []);
  assert.deepEqual(memorySymbols('const example = 2;', 'markdown'), []);
});
