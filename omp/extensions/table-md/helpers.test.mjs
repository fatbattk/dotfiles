import test from 'node:test';
import assert from 'node:assert/strict';
import { findLatestTableText, parseTableMdArgs } from './helpers.mjs';

const tableA = `noise\n+---+---+\n| A | B |\n+---+---+\n| 1 | 2 |\n+---+---+`;
const tableB = `┌─────┬─────┐\n│ New │ Val │\n├─────┼─────┤\n│ x   │ y   │\n└─────┴─────┘`;

test('findLatestTableText returns latest table-shaped text from the provided branch only', () => {
  const currentBranchEntries = [
    { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: tableA }] } },
    { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'no table here' }] } },
    { type: 'message', message: { role: 'toolResult', content: [{ type: 'text', text: tableB }] } },
  ];

  assert.equal(findLatestTableText(currentBranchEntries), tableB);
});

test('findLatestTableText ignores entries not supplied by the current branch', () => {
  const currentBranchEntries = [
    { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: tableA }] } },
  ];

  assert.equal(findLatestTableText(currentBranchEntries), tableA);
});

test('findLatestTableText recognizes markdown-only pipe tables', () => {
  const markdownOnly = '| Repo | PRs | Notes |\n| --- | ---: | --- |\n| shop/world | 3 | monorepo |';
  assert.equal(
    findLatestTableText([
      { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: markdownOnly }] } },
    ]),
    markdownOnly,
  );
});

test('parseTableMdArgs turns bare indexes and supported flags into converter argv', () => {
  assert.deepEqual(parseTableMdArgs('2 --linkify --drop-cols 4'), {
    scriptArgs: ['--index', '2', '--linkify', '--drop-cols', '4'],
    help: false,
  });
});

test('parseTableMdArgs rejects source/copy flags owned by the extension', () => {
  assert.deepEqual(parseTableMdArgs('--from-pi-session'), {
    scriptArgs: [],
    help: false,
    error: 'Unsupported argument: --from-pi-session',
  });
});
