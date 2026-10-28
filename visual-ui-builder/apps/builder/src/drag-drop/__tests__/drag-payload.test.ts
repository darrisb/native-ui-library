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

const {
  CANVAS_DRAG_MIME_TYPE,
  PALETTE_DRAG_MIME_TYPE,
  createCanvasMovePayload,
  createPaletteDragPayload,
  hasCanvasDragType,
  hasPaletteDragType,
  isInsertableComponentType,
  isRootInsertableComponentType,
  parseCanvasMovePayload,
  parsePaletteDragPayload,
  serializeCanvasMovePayload,
  serializePaletteDragPayload,
} = await import("../drag-payload.ts");

test("Valid Card payload is accepted", () => {
  const payload = parsePaletteDragPayload(
    JSON.stringify({ source: "component-palette", componentType: "card" })
  );
  assertTrue(payload !== null, "Expected payload to be accepted.");
  assertEqual(payload!.source, "component-palette");
  assertEqual(payload!.componentType, "card");
});

test("Serialized payload round-trips", () => {
  const raw = serializePaletteDragPayload(createPaletteDragPayload("card"));
  const payload = parsePaletteDragPayload(raw);
  assertEqual(payload?.componentType, "card");
});

test("Malformed JSON is rejected", () => {
  assertEqual(parsePaletteDragPayload("{not json"), null);
  assertEqual(parsePaletteDragPayload(""), null);
  assertEqual(parsePaletteDragPayload(null), null);
  assertEqual(parsePaletteDragPayload("null"), null);
  assertEqual(parsePaletteDragPayload("[]"), null);
  assertEqual(parsePaletteDragPayload('"card"'), null);
});

test("Missing component type is rejected", () => {
  assertEqual(
    parsePaletteDragPayload(JSON.stringify({ source: "component-palette" })),
    null
  );
  assertEqual(
    parsePaletteDragPayload(
      JSON.stringify({ source: "component-palette", componentType: 5 })
    ),
    null
  );
});

test("Unsupported source is rejected", () => {
  assertEqual(
    parsePaletteDragPayload(
      JSON.stringify({ source: "canvas", componentType: "card" })
    ),
    null
  );
  assertEqual(
    parsePaletteDragPayload(JSON.stringify({ componentType: "card" })),
    null
  );
});

test("Insertability includes Card, Text, and Button", () => {
  assertTrue(isInsertableComponentType("card"));
  assertTrue(isInsertableComponentType("text"));
  assertTrue(isInsertableComponentType("button"));
  assertTrue(!isInsertableComponentType("unknown"));
});

test("Only Card is root-insertable", () => {
  assertTrue(isRootInsertableComponentType("card"));
  assertTrue(!isRootInsertableComponentType("text"));
  assertTrue(!isRootInsertableComponentType("button"));
  assertTrue(!isRootInsertableComponentType("unknown"));
});

test("Unsupported component type is rejected", () => {
  for (const componentType of ["unknown", ""]) {
    assertEqual(
      parsePaletteDragPayload(
        JSON.stringify({ source: "component-palette", componentType })
      ),
      null,
      `Expected "${componentType}" to be rejected.`
    );
  }
});

test("Extra fields are discarded from the parsed payload", () => {
  const payload = parsePaletteDragPayload(
    JSON.stringify({
      source: "component-palette",
      componentType: "card",
      id: "abc",
      html: "<script>alert(1)</script>",
    })
  );
  assertTrue(payload !== null);
  assertEqual(Object.keys(payload!).sort().join(","), "componentType,source");
});

test("Oversized payloads are rejected", () => {
  const raw = JSON.stringify({
    source: "component-palette",
    componentType: "card",
    padding: "x".repeat(2000),
  });
  assertEqual(parsePaletteDragPayload(raw), null);
});

test("Creating a payload for an unsupported type throws", () => {
  let threw = false;
  try {
    createPaletteDragPayload("unknown");
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected unsupported type to throw.");
});

test("Serialized payload contains only source and component type", () => {
  const raw = serializePaletteDragPayload(createPaletteDragPayload("card"));
  assertEqual(
    Object.keys(JSON.parse(raw)).sort().join(","),
    "componentType,source"
  );
});

test("Palette drag type is detected from DataTransfer types", () => {
  assertTrue(hasPaletteDragType({ types: [PALETTE_DRAG_MIME_TYPE] }));
  assertTrue(!hasPaletteDragType({ types: ["text/plain", "Files"] }));
  assertTrue(!hasPaletteDragType(null));
});

// -----------------------------------------------------------------------------
// Canvas move payloads.
// -----------------------------------------------------------------------------

test("Valid canvas move payload is accepted", () => {
  const payload = parseCanvasMovePayload(
    JSON.stringify({ source: "builder-canvas", componentId: "text-1" })
  );
  assertTrue(payload !== null, "Expected payload to be accepted.");
  assertEqual(payload!.source, "builder-canvas");
  assertEqual(payload!.componentId, "text-1");
});

test("Serialized canvas move payload round-trips", () => {
  const raw = serializeCanvasMovePayload(createCanvasMovePayload("card-1"));
  const payload = parseCanvasMovePayload(raw);
  assertEqual(payload?.componentId, "card-1");
});

test("Canvas move payload rejects malformed JSON", () => {
  assertEqual(parseCanvasMovePayload("{not json"), null);
  assertEqual(parseCanvasMovePayload(""), null);
  assertEqual(parseCanvasMovePayload(null), null);
  assertEqual(parseCanvasMovePayload("[]"), null);
  assertEqual(parseCanvasMovePayload('"card-1"'), null);
});

test("Canvas move payload rejects missing or invalid component id", () => {
  assertEqual(
    parseCanvasMovePayload(JSON.stringify({ source: "builder-canvas" })),
    null
  );
  assertEqual(
    parseCanvasMovePayload(
      JSON.stringify({ source: "builder-canvas", componentId: 5 })
    ),
    null
  );
  assertEqual(
    parseCanvasMovePayload(
      JSON.stringify({ source: "builder-canvas", componentId: "" })
    ),
    null
  );
});

test("Canvas move payload rejects unsupported source", () => {
  assertEqual(
    parseCanvasMovePayload(
      JSON.stringify({ source: "component-palette", componentId: "card-1" })
    ),
    null
  );
  assertEqual(
    parseCanvasMovePayload(JSON.stringify({ componentId: "card-1" })),
    null
  );
});

test("Creating a canvas move payload rejects empty ids", () => {
  let threw = false;
  try {
    createCanvasMovePayload("");
  } catch {
    threw = true;
  }
  assertTrue(threw, "Expected empty id to throw.");
});

test("Canvas move payload discards extra fields", () => {
  const payload = parseCanvasMovePayload(
    JSON.stringify({
      source: "builder-canvas",
      componentId: "card-1",
      html: "<script>alert(1)</script>",
    })
  );
  assertTrue(payload !== null);
  assertEqual(Object.keys(payload!).sort().join(","), "componentId,source");
});

test("Canvas drag type is detected from DataTransfer types", () => {
  assertTrue(hasCanvasDragType({ types: [CANVAS_DRAG_MIME_TYPE] }));
  assertTrue(!hasCanvasDragType({ types: [PALETTE_DRAG_MIME_TYPE] }));
  assertTrue(!hasCanvasDragType({ types: ["text/plain", "Files"] }));
  assertTrue(!hasCanvasDragType(null));
});

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
