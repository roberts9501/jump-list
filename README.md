# Jump List

A sorted singly-linked list with skip pointers every 32 nodes, giving O(log n) search and insertion in pure ESM JavaScript with no dependencies.

```js
import { JumpList } from 'jump-list';

const jl = new JumpList((a, b) => a - b);
jl.insert(5);
jl.insert(1);
jl.insert(9);
jl.find(5);   // 5
jl.has(7);    // false
jl.delete(1); // true
jl.toArray(); // [5, 9]
```

## Why this exists

The problem: keep a collection sorted under a custom comparator while supporting point lookups, inserts, and deletes, without pulling in a full balanced-tree implementation. A plain linked list gives O(1) insert once you know the spot but O(n) to find the spot; a skip list gives O(log n) both but needs per-node level metadata and a randomised rebuild. This library splits the difference: one extra pointer per node, placed at a fixed spacing, rebuilt wholesale when the list grows or shrinks past a threshold. The rebuild is O(n) but happens at most once every 32 mutations, so amortised cost stays logarithmic. The trade-off is that a single insertion can occasionally trigger an O(n) rebuild — fine for steady-state workloads, not for latency-sensitive single-op budgets.

## Exports

- `JumpList` — the only export, from `src/index.js`.

Constructor: `new JumpList(compare)` where `compare(a, b)` returns negative / zero / positive.

Methods:

- `insert(value)` — inserts at the comparator-dictated position; duplicates go after existing equal values. Returns `true`.
- `find(target)` — returns the stored value equal to `target`, or `undefined`.
- `has(target)` — `boolean`.
- `delete(target)` — removes the first equal value; returns `true` if something was removed, `false` if absent.
- `forEach visit` — visits values in ascending order; returning `false` stops iteration.
- `toArray()` — ascending snapshot.
- `length` — current entry count.

## Awkward edges

Duplicates are allowed and kept stable relative to insertion order; `delete` removes the oldest equal value first. The comparator defines equality, so passing inconsistent comparators across calls will silently corrupt ordering — the list does not re-sort retroactively. Skip pointers are rebuilt on growth past `2 * length` and on shrinkage below `length / 2`, so a burst of deletes can trigger a rebuild pass; if you delete in a tight loop, expect occasional O(n) pauses.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

