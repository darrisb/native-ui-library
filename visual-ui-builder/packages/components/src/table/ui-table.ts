const tableStyles = `
:host {
  display: block;
  --ui-table-font-size: 1rem;
  --ui-table-font-family: inherit;
  --ui-table-cell-padding: 0.5rem 0.75rem;
  --ui-table-border-color: #d1d5db;
  --ui-table-border-radius: 0.375rem;
  --ui-table-background: #ffffff;
  --ui-table-color: #111827;
  --ui-table-header-background: #f9fafb;
  --ui-table-header-color: #374151;
  --ui-table-header-font-weight: 600;
  --ui-table-row-hover-background: #f3f4f6;
  --ui-table-message-color: #6b7280;
  --ui-table-disabled-opacity: 0.5;
  --ui-table-focus-color: #2563eb;
  --ui-table-error-color: #dc2626;
  --ui-table-error-background: #fef2f2;
}

[part="table"] {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--ui-table-border-color);
  background: var(--ui-table-background);
  color: var(--ui-table-color);
  font-family: var(--ui-table-font-family);
  font-size: var(--ui-table-font-size);
  line-height: 1.5;
}

[part="header"] {
  padding: 0;
  background: var(--ui-table-header-background);
  color: var(--ui-table-header-color);
  text-align: left;
  border-bottom: 1px solid var(--ui-table-border-color);
}

[part="header-button"] {
  display: block;
  width: 100%;
  padding: var(--ui-table-cell-padding);
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  font-weight: var(--ui-table-header-font-weight);
  text-align: left;
  cursor: pointer;
}

[part="header-button"]:hover {
  background: var(--ui-table-row-hover-background);
}

[part="header-button"]:focus-visible {
  outline: 2px solid var(--ui-table-focus-color);
  outline-offset: -2px;
}

[part="cell"] {
  padding: var(--ui-table-cell-padding);
  border-bottom: 1px solid var(--ui-table-border-color);
}

[part="row"]:hover [part="cell"] {
  background: var(--ui-table-row-hover-background);
}

[part="message"] {
  padding: var(--ui-table-cell-padding);
  color: var(--ui-table-message-color);
  text-align: center;
}

[part="pagination"] {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

[part="previous"],
[part="next"] {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ui-table-border-color);
  border-radius: var(--ui-table-border-radius);
  background: var(--ui-table-background);
  color: var(--ui-table-color);
  font-family: var(--ui-table-font-family);
  font-size: 0.875rem;
  cursor: pointer;
}

[part="previous"]:disabled,
[part="next"]:disabled {
  opacity: var(--ui-table-disabled-opacity);
  cursor: not-allowed;
}

[part="previous"]:focus-visible,
[part="next"]:focus-visible {
  outline: 2px solid var(--ui-table-focus-color);
  outline-offset: 1px;
}

[part="error"] {
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--ui-table-border-radius);
  background: var(--ui-table-error-background);
  font-size: 0.75rem;
  color: var(--ui-table-error-color);
}
`;

type TableColumn = {
  field: string;
  label: string;
};

type RowRecord = {
  readonly [field: string]: string | number | boolean | null;
};

type DataSourceStatus = "idle" | "loading" | "empty" | "error";

const DEFAULT_PAGE_SIZE = 10;

function isRecord(value: unknown): value is RowRecord {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function parseColumnsJSON(value: string | null): TableColumn[] | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const columns: TableColumn[] = [];
    for (const item of parsed) {
      if (!isRecord(item) || typeof item.field !== "string" || item.field === "") {
        continue;
      }
      columns.push({
        field: item.field,
        label:
          typeof item.label === "string" && item.label !== ""
            ? item.label
            : item.field,
      });
    }
    return columns;
  } catch {
    return null;
  }
}

function parseRowsJSON(value: string | null): RowRecord[] | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(isRecord);
  } catch {
    return null;
  }
}

function parsePageSize(value: string | null): number {
  if (value === null || value.trim() === "") {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return parsed;
}

function deriveColumns(rows: readonly RowRecord[]): TableColumn[] {
  if (rows.length === 0) {
    return [];
  }
  return Object.keys(rows[0]).map((field) => ({ field, label: field }));
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function getStatus(el: UITable): DataSourceStatus {
  const status = el.getAttribute("data-ds-status");
  if (status === "loading" || status === "empty" || status === "error") {
    return status;
  }
  return "idle";
}

/**
 * Native Web Component that renders a read-only data table for list pages.
 *
 * The component never fetches data. It renders rows written by the default
 * "rows" binding adapter (data-bound-rows attribute) and asks for other pages
 * or sort orders by firing events that the host page or binding layer handles.
 *
 * Supported attributes:
 * - columns:          JSON array of {field, label}; when absent, columns are
 *                     derived from the keys of the first row
 * - page-size:        rows per page for the pagination buttons (default 10)
 * - sort:             current sort order, e.g. "name" or "-name"
 * - data-bound-rows:  JSON array of row records written by the binding adapter
 * - data-ds-status:   one of idle, loading, empty, error
 * - data-ds-error:    error message text shown when data-ds-status is "error"
 *
 * Events:
 * - sort-change: bubbling, composed CustomEvent fired when a column header is
 *                clicked, with detail {sort} ("field", then "-field" on a
 *                second click on the same header)
 * - page-change: bubbling, composed CustomEvent fired when the Previous or
 *                Next button is clicked, with detail {offset, limit}
 */
export class UITable extends HTMLElement {
  static get observedAttributes(): string[] {
    return [
      "columns",
      "page-size",
      "sort",
      "data-bound-rows",
      "data-ds-status",
      "data-ds-error",
    ];
  }

  private tableEl: HTMLTableElement;
  private theadEl: HTMLTableSectionElement;
  private tbodyEl: HTMLTableSectionElement;
  private previousBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private errorEl: HTMLDivElement;
  /** Offset of the page currently displayed, tracked between page-change requests. */
  private _offset = 0;

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = tableStyles;
    shadow.appendChild(style);

    this.tableEl = document.createElement("table");
    this.tableEl.setAttribute("part", "table");

    this.theadEl = document.createElement("thead");
    this.tableEl.appendChild(this.theadEl);

    this.tbodyEl = document.createElement("tbody");
    this.tableEl.appendChild(this.tbodyEl);

    shadow.appendChild(this.tableEl);

    const pagination = document.createElement("div");
    pagination.setAttribute("part", "pagination");

    this.previousBtn = document.createElement("button");
    this.previousBtn.setAttribute("part", "previous");
    this.previousBtn.textContent = "Previous";
    this.previousBtn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      this.requestPage(-1);
    });
    pagination.appendChild(this.previousBtn);

    this.nextBtn = document.createElement("button");
    this.nextBtn.setAttribute("part", "next");
    this.nextBtn.textContent = "Next";
    this.nextBtn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      this.requestPage(1);
    });
    pagination.appendChild(this.nextBtn);

    shadow.appendChild(pagination);

    this.errorEl = document.createElement("div");
    this.errorEl.setAttribute("part", "error");
    shadow.appendChild(this.errorEl);
  }

  attributeChangedCallback(
    _name: string,
    _oldValue: string | null,
    _newValue: string | null,
  ): void {
    this.update();
  }

  connectedCallback(): void {
    this.update();
  }

  private update(): void {
    const status = getStatus(this);
    const pageSize = parsePageSize(this.getAttribute("page-size"));
    const sort = this.getAttribute("sort") ?? "";

    const rows = parseRowsJSON(this.getAttribute("data-bound-rows"));
    // Declared columns win; when the attribute is absent, invalid, or yields
    // no usable column, fall back to the keys of the first row.
    const declaredColumns = parseColumnsJSON(this.getAttribute("columns"));
    const columns =
      declaredColumns !== null && declaredColumns.length > 0
        ? declaredColumns
        : deriveColumns(rows ?? []);

    this.renderHead(columns, sort);

    if (status === "loading") {
      this.tableEl.setAttribute("aria-busy", "true");
      this.errorEl.textContent = "";
      this.renderTbodyMessage("Loading\u2026", columns.length);
    } else {
      this.tableEl.removeAttribute("aria-busy");
      if (status === "error") {
        this.errorEl.textContent = this.getAttribute("data-ds-error") ?? "";
      } else {
        this.errorEl.textContent = "";
      }
      if (status === "empty") {
        this.renderTbodyMessage("No rows", columns.length);
      } else {
        // idle, or error with previously bound rows still available
        this.renderTbodyRows(rows ?? [], columns);
      }
    }

    // Pagination button state: Next is disabled when fewer rows than
    // page-size arrived, Previous when the current offset is 0. Both are
    // disabled while a new page is being loaded.
    const rowCount = (rows ?? []).length;
    const setButtonDisabled = (btn: HTMLButtonElement, disabled: boolean) => {
      btn.disabled = disabled;
      if (disabled) {
        btn.setAttribute("disabled", "");
      } else {
        btn.removeAttribute("disabled");
      }
    };
    setButtonDisabled(this.previousBtn, status === "loading" || this._offset <= 0);
    setButtonDisabled(this.nextBtn, status === "loading" || rowCount < pageSize);
  }

  private renderHead(
    columns: readonly TableColumn[],
    sort: string,
  ): void {
    const tr = document.createElement("tr");
    tr.setAttribute("part", "row");

    for (const column of columns) {
      const th = document.createElement("th");
      th.setAttribute("part", "header");
      th.setAttribute("scope", "col");
      th.setAttribute(
        "aria-sort",
        this.ariaSortFor(column.field, sort),
      );

      const button = document.createElement("button");
      button.setAttribute("part", "header-button");
      button.textContent = column.label;
      button.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        this.toggleSort(column.field);
      });

      th.appendChild(button);
      tr.appendChild(th);
    }

    this.theadEl.replaceChildren(tr);
  }

  private ariaSortFor(field: string, sort: string): string {
    if (sort === field) {
      return "ascending";
    }
    if (sort === `-${field}`) {
      return "descending";
    }
    return "none";
  }

  /**
   * Toggles the sort order for a column: clicking an unsorted (or
   * otherwise-sorted) column sorts ascending by its field; clicking the
   * ascending header sorts descending, and clicking the descending header
   * goes back to ascending. The requested order is reflected on the sort
   * attribute and announced via a bubbling, composed sort-change event.
   */
  private toggleSort(field: string): void {
    const current = this.getAttribute("sort") ?? "";
    let next: string;
    if (current === field) {
      next = `-${field}`;
    } else if (current === `-${field}`) {
      next = field;
    } else {
      next = field;
    }
    this.setAttribute("sort", next);
    this.dispatchEvent(
      new CustomEvent("sort-change", {
        bubbles: true,
        composed: true,
        detail: { sort: next },
      }),
    );
  }

  /**
   * Requests the adjacent page (step of -1 or 1 times the page size).
   * The offset is tracked locally so the button disabled states can follow
   * the user; the component never fetches — the host applies the request.
   */
  private requestPage(direction: 1 | -1): void {
    const limit = parsePageSize(this.getAttribute("page-size"));
    const rows = parseRowsJSON(this.getAttribute("data-bound-rows"));
    const rowCount = (rows ?? []).length;

    if (direction === 1 && rowCount < limit) {
      return;
    }
    const next = this._offset + direction * limit;
    if (next < 0) {
      return;
    }
    this._offset = next;
    this.dispatchEvent(
      new CustomEvent("page-change", {
        bubbles: true,
        composed: true,
        detail: { offset: next, limit },
      }),
    );
    this.update();
  }

  private renderTbodyRows(
    rows: readonly RowRecord[],
    columns: readonly TableColumn[],
  ): void {
    if (rows.length === 0 || columns.length === 0) {
      this.tbodyEl.replaceChildren();
      return;
    }

    const children: Node[] = [];
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.setAttribute("part", "row");
      for (const column of columns) {
        const td = document.createElement("td");
        td.setAttribute("part", "cell");
        td.textContent = cellText(row[column.field]);
        tr.appendChild(td);
      }
      children.push(tr);
    }

    this.tbodyEl.replaceChildren(...children);
  }

  private renderTbodyMessage(message: string, columnCount: number): void {
    const tr = document.createElement("tr");
    tr.setAttribute("part", "row");

    const td = document.createElement("td");
    td.setAttribute("part", "message");
    td.colSpan = Math.max(1, columnCount);
    td.textContent = message;

    tr.appendChild(td);
    this.tbodyEl.replaceChildren(tr);
  }
}

export function registerUITable(): void {
  if (typeof customElements === "undefined") {
    return;
  }

  if (!customElements.get("ui-table")) {
    customElements.define("ui-table", UITable);
  }
}
