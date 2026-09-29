/**
 * Public entry point for the jump-list package.
 *
 * Re-exports the implementation surface so consumers import from a single path:
 *
 *   import { JumpList } from 'jump-list';
 *
 * Keeping the entry thin means the core module can be unit-tested in isolation
 * and the public boundary stays obvious.
 */
export { JumpList } from './core.js';
