interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${String(expected)}, but got ${String(actual)}.`
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message ?? "Expected value to be true.");
  }
}

interface CustomElementLike {
  attributeChangedCallback?(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void;
  connectedCallback?(): void;
}

class MockEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly composed: boolean;
  readonly detail: Record<string, unknown>;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(
    type: string,
    options: { bubbles?: boolean; composed?: boolean; detail?: Record<string, unknown> } = {}
  ) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
    this.composed = options.composed ?? false;
    this.detail = options.detail ?? {};
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class MockNode {
  children: MockNode[] = [];
  private text: string = "";
  parentNode: MockNode | null = null;
  private listeners = new Map<string, Array<(event: MockEvent) => void>>();

  appendChild(child: MockNode): MockNode {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: MockNode[]): void {
    for (const child of this.children) {
      child.parentNode = null;
    }
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  addEventListener(type: string, listener: (event: MockEvent) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: MockEvent): boolean {
    const list = this.listeners.get(event.type) ?? [];
    for (const listener of list) {
      if (event.propagationStopped) {
        break;
      }
      listener(event);
    }

    if (event.bubbles && !event.propagationStopped && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }

    return !event.defaultPrevented;
  }
}

class MockShadowRoot extends MockNode {}

class MockElement extends MockNode {
  readonly nodeName: string;
  readonly attributes = new Map<string, string>();
  shadowRoot: MockShadowRoot | null = null;
  disabled = false;
  colSpan = 0;

  constructor(nodeName?: string) {
    super();
    this.nodeName = nodeName?.toLowerCase() ?? "element";
  }

  setAttribute(name: string, value: string): void {
    const lowerName = name.toLowerCase();
    const oldValue = this.attributes.get(lowerName) ?? null;
    this.attributes.set(lowerName, String(value));

    const customLike = this as unknown as CustomElementLike;
    if (
      typeof customLike.attributeChangedCallback === "function" &&
      oldValue !== String(value)
    ) {
      customLike.attributeChangedCallback(lowerName, oldValue, String(value));
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name.toLowerCase());
  }

  attachShadow(_init: { mode: string }): MockShadowRoot {
    const root = new MockShadowRoot();
    root.parentNode = this;
    this.shadowRoot = root;
    return root;
  }
}

class MockHTMLElement extends MockElement {}

function installMockDom(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.HTMLElement = MockHTMLElement;

  globals.document = {
    createElement: (tagName: string): MockElement => new MockElement(tagName),
  };

  globals.CustomEvent = MockEvent;

  const definedElements = new Map<string, unknown>();
  globals.customElements = {
    get: (name: string): unknown => definedElements.get(name),
    define: (name: string, constructor: unknown): void => {
      definedElements.set(name, constructor);
    },
  };
}

installMockDom();

const { UITable, registerUITable } = await import("../ui-table.js");

function createTableElement(): HTMLElement {
  const element = new UITable();
  (element as unknown as CustomElementLike).connectedCallback?.();
  return element;
}

function findPart(element: HTMLElement, part: string): MockElement | undefined {
  const shadow = (element as unknown as MockElement).shadowRoot;
  if (!shadow) {
    return undefined;
  }
  return shadow.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.attributes.get("part") === part
  );
}

function findTable(element: HTMLElement): MockElement | undefined {
  return findPart(element, "table");
}

function findTableSection(
  element: HTMLElement,
  nodeName: string
): MockElement | undefined {
  const table = findTable(element);
  if (!table) {
    return undefined;
  }
  return table.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.nodeName === nodeName
  );
}

function findHead(element: HTMLElement): MockElement | undefined {
  return findTableSection(element, "thead");
}

function findBody(element: HTMLElement): MockElement | undefined {
  return findTableSection(element, "tbody");
}

function getTableRows(section: MockElement | undefined): MockElement[] {
  if (!section) {
    return [];
  }
  return section.children.filter(
    (child): child is MockElement =>
      child instanceof MockElement && child.nodeName === "tr"
  );
}

function getHeaderCells(element: HTMLElement): MockElement[] {
  const rows = getTableRows(findHead(element));
  const cells: MockElement[] = [];
  for (const row of rows) {
    for (const cell of row.children) {
      if (cell instanceof MockElement && cell.nodeName === "th") {
        cells.push(cell);
      }
    }
  }
  return cells;
}

function getHeaderButton(th: MockElement): MockElement | undefined {
  return th.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.attributes.get("part") === "header-button"
  );
}

function getBodyRows(element: HTMLElement): MockElement[] {
  return getTableRows(findBody(element));
}

function getRowCells(row: MockElement): MockElement[] {
  return row.children.filter(
    (child): child is MockElement =>
      child instanceof MockElement && child.nodeName === "td"
  );
}

function getBodyMessage(element: HTMLElement): string | null {
  for (const row of getBodyRows(element)) {
    for (const cell of getRowCells(row)) {
      if (cell.attributes.get("part") === "message") {
        return cell.textContent;
      }
    }
  }
  return null;
}

function findPagination(element: HTMLElement): MockElement | undefined {
  return findPart(element, "pagination");
}

function findPrevious(element: HTMLElement): MockElement | undefined {
  const pagination = findPagination(element);
  if (!pagination) {
    return undefined;
  }
  return pagination.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.attributes.get("part") === "previous"
  );
}

function findNext(element: HTMLElement): MockElement | undefined {
  const pagination = findPagination(element);
  if (!pagination) {
    return undefined;
  }
  return pagination.children.find(
    (child): child is MockElement =>
      child instanceof MockElement && child.attributes.get("part") === "next"
  );
}

function findError(element: HTMLElement): MockElement | undefined {
  return findPart(element, "error");
}

/** Clicks the sortable header button at the given column index. */
function clickHeader(element: HTMLElement, index: number): void {
  const th = getHeaderCells(element)[index];
  assertTrue(th !== undefined, `Expected a header cell at index ${index}.`);
  const button = getHeaderButton(th!);
  assertTrue(button !== undefined, "Expected a sortable header button.");
  button!.dispatchEvent(
    new MockEvent("click", { bubbles: true, composed: true })
  );
}

// === TESTS ===

test("Renders rows with labelled headers from the columns attribute", () => {
  const element = createTableElement();
  element.setAttribute(
    "columns",
    JSON.stringify([
      { field: "name", label: "Name" },
      { field: "age", label: "Age" },
    ])
  );
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([
      { name: "Alice", age: 30 },
      { name: "Bob", age: null },
    ])
  );

  const headers = getHeaderCells(element);
  assertEqual(headers.length, 2, "Expected 2 header cells.");
  assertEqual(getHeaderButton(headers[0])!.textContent, "Name");
  assertEqual(getHeaderButton(headers[1])!.textContent, "Age");
  assertEqual(headers[0].getAttribute("aria-sort"), "none");

  const rows = getBodyRows(element);
  assertEqual(rows.length, 2, "Expected 2 body rows.");
  const firstCells = getRowCells(rows[0]);
  assertEqual(firstCells.length, 2, "Expected 2 cells in the first row.");
  assertEqual(firstCells[0].textContent, "Alice");
  assertEqual(firstCells[1].textContent, "30");
  const secondCells = getRowCells(rows[1]);
  assertEqual(secondCells[0].textContent, "Bob");
  assertEqual(
    secondCells[1].textContent,
    "",
    "Expected a null value to render as empty text."
  );
});

test("Derives columns from the first row when no columns attribute is given", () => {
  const element = createTableElement();
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([
      { name: "Alice", active: true },
      { name: "Bob", active: false },
    ])
  );

  const headers = getHeaderCells(element);
  assertEqual(headers.length, 2, "Expected 2 derived header cells.");
  assertEqual(getHeaderButton(headers[0])!.textContent, "name");
  assertEqual(getHeaderButton(headers[1])!.textContent, "active");

  const rows = getBodyRows(element);
  assertEqual(rows.length, 2, "Expected 2 body rows.");
  assertEqual(getRowCells(rows[0])[0].textContent, "Alice");
  assertEqual(getRowCells(rows[1])[1].textContent, "false");
});

test("Cell text containing <script> renders as text, not HTML", () => {
  const element = createTableElement();
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([{ html: '<script>alert("xss")</script>' }])
  );

  const rows = getBodyRows(element);
  assertEqual(rows.length, 1, "Expected 1 body row.");
  const cell = getRowCells(rows[0])[0];
  assertEqual(
    cell.textContent,
    '<script>alert("xss")</script>',
    "Expected the script tag to be rendered as text."
  );
  const scriptChild = cell.children.find(
    (child) =>
      child instanceof MockElement && child.nodeName === "script"
  );
  assertEqual(scriptChild, undefined, "Expected no script child element.");
});

test("Clicking a header fires a bubbling composed sort-change event", () => {
  const element = createTableElement();
  element.setAttribute(
    "columns",
    JSON.stringify([{ field: "name", label: "Name" }])
  );
  element.setAttribute("data-bound-rows", JSON.stringify([{ name: "Alice" }]));

  const events: MockEvent[] = [];
  (element as unknown as MockElement).addEventListener(
    "sort-change",
    (e: MockEvent) => events.push(e)
  );

  clickHeader(element, 0);

  assertEqual(events.length, 1, "Expected one sort-change event.");
  assertTrue(events[0].bubbles, "Expected sort-change to bubble.");
  assertTrue(events[0].composed, "Expected sort-change to be composed.");
  assertEqual(events[0].detail.sort, "name", "Expected first click to sort by field.");
});

test("Second click on the same header sorts by -field and toggles aria-sort", () => {
  const element = createTableElement();
  element.setAttribute(
    "columns",
    JSON.stringify([
      { field: "name", label: "Name" },
      { field: "age", label: "Age" },
    ])
  );
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([{ name: "Alice", age: 30 }])
  );

  const events: MockEvent[] = [];
  (element as unknown as MockElement).addEventListener(
    "sort-change",
    (e: MockEvent) => events.push(e)
  );

  clickHeader(element, 0);
  assertEqual(events[0].detail.sort, "name");
  let headers = getHeaderCells(element);
  assertEqual(headers[0].getAttribute("aria-sort"), "ascending");
  assertEqual(headers[1].getAttribute("aria-sort"), "none");
  assertEqual(element.getAttribute("sort"), "name");

  clickHeader(element, 0);
  assertEqual(events[1].detail.sort, "-name");
  headers = getHeaderCells(element);
  assertEqual(headers[0].getAttribute("aria-sort"), "descending");
  assertEqual(element.getAttribute("sort"), "-name");

  // Clicking a different column sorts ascending by that field.
  clickHeader(element, 1);
  assertEqual(events[2].detail.sort, "age");
  headers = getHeaderCells(element);
  assertEqual(headers[0].getAttribute("aria-sort"), "none");
  assertEqual(headers[1].getAttribute("aria-sort"), "ascending");
});

test("sort-change bubbles to a parent container", () => {
  const element = createTableElement();
  element.setAttribute(
    "columns",
    JSON.stringify([{ field: "name", label: "Name" }])
  );

  const parent = new MockElement("div");
  parent.appendChild(element as unknown as MockElement);

  let parentCount = 0;
  parent.addEventListener("sort-change", () => {
    parentCount += 1;
  });

  clickHeader(element, 0);
  assertEqual(parentCount, 1, "Expected parent to receive sort-change.");
});

test("Clicking Next/Previous fires page-change with detail {offset, limit}", () => {
  const element = createTableElement();
  element.setAttribute("page-size", "2");
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([
      { name: "a" },
      { name: "b" },
      { name: "c" },
      { name: "d" },
    ])
  );

  const events: MockEvent[] = [];
  (element as unknown as MockElement).addEventListener(
    "page-change",
    (e: MockEvent) => events.push(e)
  );

  const next = findNext(element);
  assertTrue(next !== undefined, "Expected a Next button.");
  assertTrue(!next!.disabled, "Expected Next to be enabled with a full page.");
  const previous = findPrevious(element);
  assertTrue(previous!.disabled, "Expected Previous to be disabled at offset 0.");

  next!.dispatchEvent(new MockEvent("click", { bubbles: true, composed: true }));
  assertEqual(events.length, 1, "Expected one page-change event.");
  assertTrue(events[0].bubbles, "Expected page-change to bubble.");
  assertTrue(events[0].composed, "Expected page-change to be composed.");
  assertEqual(events[0].detail.offset, 2, "Expected offset to advance by the page size.");
  assertEqual(events[0].detail.limit, 2, "Expected limit to equal the page size.");

  // After requesting page 1, Previous becomes enabled and goes back to 0.
  assertTrue(!findPrevious(element)!.disabled, "Expected Previous to be enabled.");
  findPrevious(element)!.dispatchEvent(
    new MockEvent("click", { bubbles: true, composed: true })
  );
  assertEqual(events.length, 2, "Expected a second page-change event.");
  assertEqual(events[1].detail.offset, 0);
  assertEqual(events[1].detail.limit, 2);
});

test("Next is disabled when fewer rows than page-size arrived", () => {
  const element = createTableElement();
  element.setAttribute("page-size", "10");
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([
      { name: "a" },
      { name: "b" },
      { name: "c" },
    ])
  );

  assertTrue(findNext(element)!.disabled, "Expected Next to be disabled on a short page.");
  assertTrue(findPrevious(element)!.disabled, "Expected Previous to be disabled at offset 0.");
});

test("Loading state sets aria-busy and renders a loading row", () => {
  const element = createTableElement();
  element.setAttribute("data-ds-status", "loading");

  assertEqual(findTable(element)!.getAttribute("aria-busy"), "true");
  assertEqual(getBodyMessage(element), "Loading\u2026");
  assertTrue(findNext(element)!.disabled, "Expected Next to be disabled while loading.");
  assertTrue(findPrevious(element)!.disabled, "Expected Previous to be disabled while loading.");
});

test("Empty state renders a 'No rows' message", () => {
  const element = createTableElement();
  element.setAttribute("data-ds-status", "empty");
  assertEqual(getBodyMessage(element), "No rows");
});

test("Error state shows the data-ds-error message in part=error", () => {
  const element = createTableElement();
  element.setAttribute("data-ds-status", "error");
  element.setAttribute("data-ds-error", "Failed to load rows");

  const errorEl = findError(element);
  assertTrue(errorEl !== undefined, "Expected an error element.");
  assertEqual(errorEl!.textContent, "Failed to load rows");
  assertEqual(
    findTable(element)!.getAttribute("aria-busy"),
    null,
    "Expected no aria-busy in the error state."
  );
});

test("Invalid data-bound-rows JSON renders no rows without throwing", () => {
  const element = createTableElement();
  element.setAttribute("data-bound-rows", "not valid json {{{");
  assertEqual(getBodyRows(element).length, 0, "Expected no rows for invalid JSON.");
});

test("Invalid columns JSON falls back to derived columns without throwing", () => {
  const element = createTableElement();
  element.setAttribute("columns", "{oops");
  element.setAttribute(
    "data-bound-rows",
    JSON.stringify([{ name: "Alice" }])
  );

  const headers = getHeaderCells(element);
  assertEqual(headers.length, 1, "Expected a derived header cell.");
  assertEqual(getHeaderButton(headers[0])!.textContent, "name");
  assertEqual(getBodyRows(element).length, 1, "Expected 1 body row.");
});

test("registerUITable defines the ui-table custom element", () => {
  registerUITable();
  assertTrue(
    typeof customElements.get("ui-table") === "function",
    "Expected ui-table to be defined."
  );
});

test("registerUITable is idempotent", () => {
  registerUITable();
  registerUITable();
  assertTrue(
    typeof customElements.get("ui-table") === "function",
    "Expected ui-table to remain defined."
  );
});

// === REPORT ===

const passed = results.filter((result) => result.passed).length;
const failed = results.filter((result) => !result.passed).length;

for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name}`);
  if (result.error) {
    console.log(`  ${result.error}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  throw new Error(`${failed} test(s) failed.`);
}

export {};
