/** A single dropdown option with a value and display label. */
export interface DropdownOption {
  /** The option's machine-readable value. */
  readonly value: string;

  /** The option's human-readable label. */
  readonly label: string;
}

/**
 * Parses a multiline string into an array of {@link DropdownOption}.
 *
 * Format — one option per line:
 *   - `value|label` → value = left side, label = right side
 *   - `label`       → value = label, label = label
 *   - extra `|` characters are kept as part of the label
 *   - blank lines are skipped
 *   - each line is trimmed before parsing
 *
 * @param text The raw multiline string (may be empty).
 * @returns Parsed options, or an empty array for blank input.
 */
export function parseStaticOptions(text: string): DropdownOption[] {
  if (!text) return [];

  const options: DropdownOption[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const pipeIndex = line.indexOf("|");
    if (pipeIndex === -1) {
      // label-only line: value equals label
      options.push({ value: line, label: line });
    } else {
      const value = line.slice(0, pipeIndex);
      // Everything after the first "|" is the label (may contain more "|")
      const label = line.slice(pipeIndex + 1);
      options.push({ value, label });
    }
  }

  return options;
}
