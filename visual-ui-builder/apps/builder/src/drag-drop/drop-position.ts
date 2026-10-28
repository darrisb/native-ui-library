/** The vertical extent of a root-level component wrapper. */
export interface VerticalBounds {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Determines the root-level insertion index for a pointer position.
 *
 * `bounds` must describe the existing root wrappers in document order (top to
 * bottom). The pointer inserts before the first wrapper whose vertical midpoint
 * lies below it, and appends when it is below every midpoint. An empty list, or
 * a non-finite pointer position, yields the end of the list (index 0 for an
 * empty canvas).
 */
export function calculateDropIndex(
  pointerY: number,
  bounds: readonly VerticalBounds[]
): number {
  if (!Number.isFinite(pointerY)) {
    return bounds.length;
  }

  for (let index = 0; index < bounds.length; index++) {
    const { top, bottom } = bounds[index];
    const midpoint = top + (bottom - top) / 2;
    if (pointerY < midpoint) {
      return index;
    }
  }

  return bounds.length;
}

/**
 * Returns the viewport y-coordinate at which to draw the insertion indicator
 * for `index`: the top edge of the wrapper it precedes, the midpoint of the gap
 * between two wrappers, or the bottom edge of the last wrapper. Returns `null`
 * for an empty list, where the indicator is positioned by stylesheet.
 */
export function getIndicatorY(
  index: number,
  bounds: readonly VerticalBounds[]
): number | null {
  if (bounds.length === 0) {
    return null;
  }
  if (index <= 0) {
    return bounds[0].top;
  }
  if (index >= bounds.length) {
    return bounds[bounds.length - 1].bottom;
  }
  return (bounds[index - 1].bottom + bounds[index].top) / 2;
}
