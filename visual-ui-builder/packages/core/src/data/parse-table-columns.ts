/** A single table column with a row field and display label. */
export interface TableColumn {
  /** The row record field the column displays. */
  readonly field: string;

  /** The column's human-readable label. */
  readonly label: string;
}

/**
 * Parses a multiline string into an array of {@link TableColumn}.
 *
 * Format — one column per line:
 *   - `field|Label` → field = left side, label = right side
 *   - `field`       → field = field, label = field
 *   - extra `|` characters are kept as part of the label
 *   - blank lines are skipped
 *   - each line is trimmed before parsing
 *
 * @param text The raw multiline string (may be empty).
 * @returns Parsed columns, or an empty array for blank input.
 */
export function parseTableColumns(text: string): TableColumn[] {
  if (!text) return [];

  const columns: TableColumn[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const pipeIndex = line.indexOf("|");
    if (pipeIndex === -1) {
      // field-only line: label equals field
      columns.push({ field: line, label: line });
    } else {
      const field = line.slice(0, pipeIndex);
      // Everything after the first "|" is the label (may contain more "|")
      const label = line.slice(pipeIndex + 1);
      columns.push({ field, label });
    }
  }

  return columns;
}
