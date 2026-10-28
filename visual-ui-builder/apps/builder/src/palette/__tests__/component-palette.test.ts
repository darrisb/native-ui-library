import { ComponentRegistry, registerSampleDefinitions } from "@visual-ui/core";
import {
  getPaletteGroups,
  PALETTE_CATEGORIES,
  type PaletteGroup,
} from "../component-palette-data.ts";

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

function findGroup(
  groups: readonly PaletteGroup[],
  category: string
): PaletteGroup | undefined {
  return groups.find((group) => group.category === category);
}

function getComponentNames(group: PaletteGroup | undefined): string[] {
  return group?.components.map((component) => component.name) ?? [];
}

test("Card appears under Content", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const groups = getPaletteGroups(registry);
  const content = findGroup(groups, "Content");
  assertTrue(
    getComponentNames(content).includes("Card"),
    `Expected Card in Content, got: ${getComponentNames(content).join(", ")}`
  );
});

test("Text appears under Content", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const groups = getPaletteGroups(registry);
  const content = findGroup(groups, "Content");
  assertTrue(
    getComponentNames(content).includes("Text"),
    `Expected Text in Content, got: ${getComponentNames(content).join(", ")}`
  );
});

test("Button appears under Actions", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const groups = getPaletteGroups(registry);
  const actions = findGroup(groups, "Actions");
  assertTrue(
    getComponentNames(actions).includes("Button"),
    `Expected Button in Actions, got: ${getComponentNames(actions).join(", ")}`
  );
});

test("Empty categories do not cause errors", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const groups = getPaletteGroups(registry);
  for (const category of PALETTE_CATEGORIES) {
    const group = findGroup(groups, category);
    assertTrue(group !== undefined, `Missing category: ${category}`);
  }
});

test("An empty registry produces a valid empty state", () => {
  const registry = new ComponentRegistry();
  const groups = getPaletteGroups(registry);
  assertEqual(groups.length, PALETTE_CATEGORIES.length);
  for (const group of groups) {
    assertEqual(group.components.length, 0);
  }
});

test("Adding another definition appears without changing palette code", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  registry.register({
    type: "divider",
    name: "Divider",
    category: "Layout",
    description: "Visual separator.",
    allowChildren: false,
    properties: [],
  });
  const groups = getPaletteGroups(registry);
  const layout = findGroup(groups, "Layout");
  assertTrue(
    getComponentNames(layout).includes("Divider"),
    `Expected Divider in Layout, got: ${getComponentNames(layout).join(", ")}`
  );
});

test("Component descriptions come from metadata", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const groups = getPaletteGroups(registry);
  const card = groups
    .flatMap((group) => group.components)
    .find((component) => component.name === "Card");
  assertEqual(card?.description, "Container for related content.");
});

test("No browser custom-element registration is required", () => {
  const registry = new ComponentRegistry();
  registerSampleDefinitions(registry);
  const definitions = registry.list();
  assertTrue(definitions.length > 0);
  assertEqual(
    typeof (globalThis as Record<string, unknown>).customElements,
    "undefined",
    "customElements should not be accessed by palette metadata tests."
  );
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
