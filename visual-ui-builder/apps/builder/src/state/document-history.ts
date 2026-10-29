import type { BuilderDocument } from "./builder-document.ts";

/** Maximum number of past snapshots retained to bound memory usage. */
const MAX_PAST_HISTORY = 50;

/**
 * Immutable document history tracking past, present, and future snapshots
 * for undo/redo support.
 *
 * All arrays and document references are treated as immutable. Operations
 * return a new history instance rather than mutating the existing one.
 */
export interface DocumentHistory {
  /** Snapshots prior to the present, oldest first. */
  readonly past: readonly BuilderDocument[];

  /** The current document snapshot. */
  readonly present: BuilderDocument;

  /** Snapshots ahead of the present after undo, next-document first. */
  readonly future: readonly BuilderDocument[];

  /** True when at least one undo operation is available. */
  readonly canUndo: boolean;

  /** True when at least one redo operation is available. */
  readonly canRedo: boolean;

  /**
   * Records a new document snapshot.
   *
   * If the supplied document is the same reference as the present snapshot,
   * the original history is returned unchanged. Otherwise the present is moved
   * into the past, the supplied document becomes the new present, and the
   * future (redo) history is cleared. Past history is capped to
   * {@link MAX_PAST_HISTORY} snapshots.
   */
  record(document: BuilderDocument): DocumentHistory;

  /**
   * Moves the present into the future and restores the most recent past
   * snapshot as the new present.
   *
   * Returns the original history unchanged when there is no past snapshot to
   * undo to.
   */
  undo(): DocumentHistory;

  /**
   * Moves the present into the past and restores the nearest future snapshot
   * as the new present.
   *
   * Returns the original history unchanged when there is no future snapshot to
   * redo to.
   */
  redo(): DocumentHistory;
}

/**
 * Creates an empty document history with the supplied document as the initial
 * present snapshot.
 */
export function createDocumentHistory(
  initial: BuilderDocument
): DocumentHistory {
  return createHistoryObject([], initial, []);
}

function createHistoryObject(
  past: readonly BuilderDocument[],
  present: BuilderDocument,
  future: readonly BuilderDocument[]
): DocumentHistory {
  return {
    past,
    present,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    record(document: BuilderDocument): DocumentHistory {
      if (document === this.present) {
        return this;
      }

      const nextPast = [...this.past, this.present];
      const cappedPast =
        nextPast.length > MAX_PAST_HISTORY
          ? nextPast.slice(nextPast.length - MAX_PAST_HISTORY)
          : nextPast;

      return createHistoryObject(cappedPast, document, []);
    },
    undo(): DocumentHistory {
      if (this.past.length === 0) {
        return this;
      }

      const newPresent = this.past[this.past.length - 1];
      const newPast = this.past.slice(0, this.past.length - 1);
      const newFuture = [this.present, ...this.future];

      return createHistoryObject(newPast, newPresent, newFuture);
    },
    redo(): DocumentHistory {
      if (this.future.length === 0) {
        return this;
      }

      const newPresent = this.future[0];
      const newPast = [...this.past, this.present];
      const newFuture = this.future.slice(1);

      return createHistoryObject(newPast, newPresent, newFuture);
    },
  };
}
