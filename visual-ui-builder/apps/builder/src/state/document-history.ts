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
  const history: DocumentHistory = {
    past,
    present,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    record(document: BuilderDocument): DocumentHistory {
      if (document === present) {
        return history;
      }

      const nextPast = [...past, present];
      const cappedPast =
        nextPast.length > MAX_PAST_HISTORY
          ? nextPast.slice(nextPast.length - MAX_PAST_HISTORY)
          : nextPast;

      return createHistoryObject(cappedPast, document, []);
    },
    undo(): DocumentHistory {
      if (past.length === 0) {
        return history;
      }

      const newPresent = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      const newFuture = [present, ...future];

      return createHistoryObject(newPast, newPresent, newFuture);
    },
    redo(): DocumentHistory {
      if (future.length === 0) {
        return history;
      }

      const newPresent = future[0];
      const newPast = [...past, present];
      const newFuture = future.slice(1);

      return createHistoryObject(newPast, newPresent, newFuture);
    },
  };

  return history;
}
