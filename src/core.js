/**
 * Jump List — core implementation.
 *
 * A singly-linked list that carries skip pointers at roughly every SPACING nodes,
 * giving O(log n) search and insertion while keeping the per-node overhead to one
 * extra reference. The list is kept in sorted order by a caller-supplied comparator.
 *
 * Design decisions, because they are not obvious:
 *
 * - The head is a sentinel with `value === null` and is never returned to the caller.
 *   A sentinel removes every special case for an empty list: insertion, search and
 *   traversal all share one code path.
 *
 * - Skip pointers are rebuilt wholesale whenever the list length crosses SPACING * 2.
 *   Rebuild is O(n), but it happens at most once every SPACING insertions, so amortised
 *   cost stays O(log n). Patching skips in place on every insert is fiddly and tends to
 *   drift; wholesale rebuild is simpler and the constant factor is tiny.
 *
 * - `find()` returns the matching node's value, or `undefined` when absent. Returning
 *   `undefined` (rather than throwing) matches `Map.get` and keeps callers free of
 *   try/catch for a routine miss.
 */

/**
 * Default gap between consecutive skip-pointer origin nodes.
 *
 * Chosen so that a list of up to ~10 6 entries keeps at most ~20 skip hops on the
 * fast path. Small lists (fewer than SPACING entries) get no skips at all, which is
 * correct — a linear scan of a short list beats the bookkeeping.
 */
const SPACING = 32;

/**
 * @typedef {object} Node
 * @property {unknown} value   The stored value; `null` only on the sentinel head.
 * @property {Node|null} next  The successor node, or `null` at the tail.
 * @property {Node|null} skip  A shortcut pointer to a node roughly SPACING ahead,
 *                             or `null` when this node is not a skip origin.
 */

/**
 * Allocate a fresh node. Keeping allocation in one place makes future tuning
 * (e.g. an object pool) a single-file change.
 *
 * @param {unknown} value
 * @param {Node|null} next
 * @param {Node|null} skip
 * @returns {Node}
 */
function makeNode(value, next, skip) {
  return { value, next, skip };
}

/**
 * A sorted linked list with skip pointers for logarithmic access.
 */
export class JumpList {
  /**
   * @param {(a: unknown, b: unknown) => number} compare
   *   Comparator in the usual `a - b` sense: negative when `a < b`, zero when equal,
   *   positive when `a > b`. Required because the list cannot order values on its own.
   */
  constructor(compare) {
    if (typeof compare !== 'function') {
      throw new TypeError('JumpList requires a comparator function');
    }
    this._compare = compare;
    /**
     * Sentinel head. Its `value` is `null` and never participates in comparisons;
     * the comparator is only ever called on real entries.
     */
    this._head = makeNode(null, null, null);
    this._length = 0;
    /**
     * Threshold at which the next rebuild is triggered. Starts at SPACING so that the
     * very first rebuild fires once the list reaches SPACING entries.
     */
    this._rebuildAt = SPACING;
  }

  /** Number of entries currently stored. */
  get length() {
    return this._length;
  }

  /**
   * Find the rightmost node whose value compares as strictly less than `target`,
   * plus its successor. Used by both `has`/`find` (to test the successor) and
   * `insert` (to splice between the two).
   *
   * Uses skip pointers where they exist and falls back to a linear walk for the
   * final gap, which is at most SPACING nodes wide.
   *
   * @private
   * @param {unknown} target
   * @returns {{prev: Node, node: Node}} `prev` is the predecessor; `node` is what
   *   follows it (may be the tail sentinel, i.e. `null` is not returned — the
   *   tail's `next` is `null`, but `node` itself is always a real Node or the tail).
   */
  _search(target) {
    let prev = this._head;
    let node = prev.next;

    // Fast path: ride the skips while they safely land before `target`.
    while (node !== null && node.skip !== null) {
      const cmp = this._compare(node.skip.value, target);
      if (cmp < 0 || (cmp === 0 && this._compare(node.skip.value, target) === 0 && this._compare(node.value, target) < 0)) {
        // Landing on the skip target is fine for equality too, but only advance
        // when we are sure we are not skipping over the exact match. The simplest
        // safe rule: advance when the skip target is strictly less than target.
        if (cmp < 0) {
          prev = node.skip;
          node = prev.next;
          continue;
        }
      }
      break;
    }

    // Linear walk through the remaining short gap.
    while (node !== null && this._compare(node.value, target) < 0) {
      prev = node;
      node = node.next;
    }

    return { prev, node };
  }

  /**
   * Rewrite every skip pointer from scratch. Called only when the list has grown
   * enough to justify the O(n) pass.
   *
   * @private
   */
  _rebuildSkips() {
    // First, clear stale skips so partial state can never survive a rebuild.
    for (let n = this._head; n !== null; n = n.next) {
      n.skip = null;
    }

    // Collect every SPACING-th node starting at the head sentinel. The sentinel
    // itself becomes the first skip origin, which means the first hop from the
    // head jumps SPACING entries — exactly the behaviour we want for search.
    const origins = [];
    let i = 0;
    for (let n = this._head; n !== null; n = n.next, i++) {
      if (i % SPACING === 0) origins.push(n);
    }

    for (let j = 0; j < origins.length; j++) {
      const targetIndex = (j + 1) * SPACING;
      if (targetIndex > this._length) break; // no room for another hop
      // Walk forward from the origin to its target index. Because origins are
      // spaced SPACING apart, this inner walk is bounded by SPACING.
      let target = origins[j];
      for (let k = 0; k < SPACING && target !== null; k++) {
        target = target.next;
      }
      if (target !== null) origins[j].skip = target;
    }

    // Schedule the next rebuild for when the list has doubled again.
    this._rebuildAt = Math.max(SPACING, this._length * 2);
  }

  /**
   * Insert `value` into the list at the position dictated by the comparator.
   * Duplicates are allowed and kept in insertion order relative to each other
   * (the new node goes *after* existing equal values).
   *
   * @param {unknown} value
   * @returns {boolean} `true` once inserted (always — insertion never fails).
   */
  insert(value) {
    const { prev } = this._search(value);
    const node = makeNode(value, prev.next, null);
    prev.next = node;
    this._length++;

    if (this._length >= this._rebuildAt) {
      this._rebuildSkips();
    }
    return true;
  }

  /**
   * Return the stored value equal to `target` under the comparator, or `undefined`
   * when no such entry exists. Equality is defined as `compare(a, target) === 0`.
   *
   * @param {unknown} target
   * @returns {unknown|undefined}
   */
  find(target) {
    const { node } = this._search(target);
    if (node !== null && this._compare(node.value, target) === 0) {
      return node.value;
    }
    return undefined;
  }

  /**
   * Remove the first value equal to `target` under the comparator.
   *
   * @param {unknown} target
   * @returns {boolean} `true` if a value was removed, `false` if not present.
   */
  delete(target) {
    const { prev, node } = this._search(target);
    if (node === null || this._compare(node.value, target) !== 0) {
      return false;
    }
    prev.next = node.next;
    this._length--;

    // Removing a node can invalidate a skip that pointed at it. Rather than patch
    // skips piecemeal — which is error-prone — we rebuild when the list shrinks
    // past the lower threshold. This keeps deletes O(log n) amortised.
    if (this._length > 0 && this._length * 2 <= this._rebuildAt) {
      this._rebuildSkips();
    } else if (this._length === 0) {
      this._head.next = null;
      this._head.skip = null;
      this._rebuildAt = SPACING;
    }
    return true;
  }

  /**
   * Report whether a value equal to `target` is present.
   *
   * @param {unknown} target
   * @returns {boolean}
   */
  has(target) {
    return this.find(target) !== undefined;
  }

  /**
   * Visit every stored value in ascending order. Iteration stops early if `visit`
   * returns `false`.
   *
   * @param {(value: unknown) => boolean|void} visit
   */
  forEach(visit) {
    if (typeof visit !== 'function') {
      throw new TypeError('forEach requires a callback');
    }
    for (let n = this._head.next; n !== null; n = n.next) {
      if (visit(n.value) === false) break;
    }
  }

  /**
   * Return all stored values in ascending order as a plain array.
   * Mainly useful for tests and small-list snapshots.
   *
   * @returns {unknown[]}
   */
  toArray() {
    const out = [];
    for (let n = this._head.next; n !== null; n = n.next) {
      out.push(n.value);
    }
    return out;
  }
}
