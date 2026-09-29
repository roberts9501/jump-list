import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JumpList } from '../src/index.js';

/** Numeric comparator — the most common case and the basis for most tests. */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

test('constructs empty and reports length zero', () => {
  const jl = new JumpList(cmp);
  assert.equal(jl.length, 0);
  assert.deepEqual(jl.toArray(), []);
});

test('rejects a missing comparator', () => {
  assert.throws(() => new JumpList(), TypeError);
  assert.throws(() => new JumpList('not a fn'), TypeError);
});

test('insert keeps the list sorted', () => {
  const jl = new JumpList(cmp);
  for (const v of [5, 1, 9, 3, 7, 2, 8, 0, 6, 4]) jl.insert(v);
  assert.deepEqual(jl.toArray(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(jl.length, 10);
});

test('find returns the stored value or undefined', () => {
  const jl = new JumpList(cmp);
  for (const v of [10, 20, 30]) jl.insert(v);
  assert.equal(jl.find(20), 20);
  assert.equal(jl.find(25), undefined);
  assert.equal(jl.find(0), undefined);
});

test('has mirrors find', () => {
  const jl = new JumpList(cmp);
  jl.insert(7);
  assert.equal(jl.has(7), true);
  assert.equal(jl.has(8), false);
});

test('large sorted insertions stay ordered across a rebuild', () => {
  const N = 500;
  const jl = new JumpList(cmp);
  // Insert in reverse to stress the search path.
  for (let i = N - 1; i >= 0; i--) jl.insert(i);
  assert.equal(jl.length, N);
  const arr = jl.toArray();
  for (let i = 0; i < N; i++) assert.equal(arr[i], i);
  // Every value must be findable after skips have been rebuilt.
  for (let i = 0; i < N; i++) assert.equal(jl.find(i), i);
});

test('find works on a list large enough to exercise skip hops', () => {
  const N = 200;
  const jl = new JumpList(cmp);
  for (let i = 0; i < N; i++) jl.insert(i * 2); // even numbers only
  assert.equal(jl.find(0), 0);
  assert.equal(jl.find(398), 398);
  assert.equal(jl.find(100), 100);
  assert.equal(jl.find(101), undefined); // odd, absent
  assert.equal(jl.find(400), undefined); // past the end
});

test('duplicate equal values are kept and found', () => {
  const jl = new JumpList(cmp);
  jl.insert(5);
  jl.insert(5);
  jl.insert(5);
  assert.equal(jl.length, 3);
  assert.equal(jl.find(5), 5);
  assert.deepEqual(jl.toArray(), [5, 5, 5]);
});

test('delete removes one matching value', () => {
  const jl = new JumpList(cmp);
  for (const v of [1, 2, 2, 3]) jl.insert(v);
  assert.equal(jl.delete(2), true);
  assert.equal(jl.length, 3);
  assert.deepEqual(jl.toArray(), [1, 2, 3]);
});

test('delete on absent value returns false and leaves the list intact', () => {
  const jl = new JumpList(cmp);
  for (const v of [1, 2, 3]) jl.insert(v);
  assert.equal(jl.delete(99), false);
  assert.equal(jl.length, 3);
  assert.deepEqual(jl.toArray(), [1, 2, 3]);
});

test('delete from an empty list is a no-op', () => {
  const jl = new JumpList(cmp);
  assert.equal(jl.delete(1), false);
  assert.equal(jl.length, 0);
});

test('deleting down to empty then re-inserting works', () => {
  const jl = new JumpList(cmp);
  jl.insert(1);
  jl.insert(2);
  assert.equal(jl.delete(1), true);
  assert.equal(jl.delete(2), true);
  assert.equal(jl.length, 0);
  assert.deepEqual(jl.toArray(), []);
  jl.insert(3);
  assert.equal(jl.length, 1);
  assert.equal(jl.find(3), 3);
});

test('forEach visits in ascending order and supports early stop', () => {
  const jl = new JumpList(cmp);
  for (const v of [3, 1, 2]) jl.insert(v);
  const seen = [];
  jl.forEach((v) => { seen.push(v); if (v === 2) return false; });
  assert.deepEqual(seen, [1, 2]);
});

test('forEach rejects a non-function callback', () => {
  const jl = new JumpList(cmp);
  jl.insert(1);
  assert.throws(() => jl.forEach(null), TypeError);
});

test('works with a string comparator', () => {
  const s = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const jl = new JumpList(s);
  for (const w of ['pear', 'apple', 'banana']) jl.insert(w);
  assert.deepEqual(jl.toArray(), ['apple', 'banana', 'pear']);
  assert.equal(jl.find('banana'), 'banana');
  assert.equal(jl.find('grape'), undefined);
});

test('delete a value that a skip pointer targeted keeps the list consistent', () => {
  const N = 100;
  const jl = new JumpList(cmp);
  for (let i = 0; i < N; i++) jl.insert(i);
  // Remove a handful spread across the range, including values that skip
  // pointers would have targeted.
  for (const v of [0, 32, 64, 99, 50]) assert.equal(jl.delete(v), true);
  assert.equal(jl.length, N - 5);
  // Every remaining value must still be findable — this is what catches a
  // stale skip pointer that now points at a removed node.
  for (let i = 0; i < N; i++) {
    if ([0, 32, 64, 99, 50].includes(i)) {
      assert.equal(jl.find(i), undefined);
    } else {
      assert.equal(jl.find(i), i);
    }
  }
});
