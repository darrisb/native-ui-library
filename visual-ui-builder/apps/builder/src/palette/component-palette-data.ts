import type { ComponentDefinition, ComponentRegistry } from "@visual-ui/core";

/**
 * Standard palette categories in the order they should appear.
 * These labels are presentation metadata, not component implementations.
 */
export const PALETTE_CATEGORIES = [
  "Layout",
  "Content",
  "Forms",
  "Data",
  "Actions",
] as const;

export type PaletteCategory = (typeof PALETTE_CATEGORIES)[number];

export interface PaletteGroup {
  readonly category: PaletteCategory;
  readonly icon: string;
  readonly components: readonly ComponentDefinition[];
}

const CATEGORY_ICONS: Record<PaletteCategory, string> = {
  Layout: "▦",
  Content: "☰",
  Forms: "✎",
  Data: "◧",
  Actions: "▸",
};

function normalizeCategory(category: string): PaletteCategory | string {
  const normalized = category.trim().toLowerCase();
  switch (normalized) {
    case "layout":
      return "Layout";
    case "content":
      return "Content";
    case "forms":
      return "Forms";
    case "data":
      return "Data";
    case "actions":
      return "Actions";
    default:
      return category.trim();
  }
}

/**
 * Groups registered component definitions by palette category.
 *
 * Unknown categories are currently ignored; only the standard palette
 * categories are returned, in a predictable order.
 */
export function getPaletteGroups(registry: ComponentRegistry): PaletteGroup[] {
  const definitions = registry.list();
  const groups = new Map<string, ComponentDefinition[]>();

  for (const definition of definitions) {
    const category = normalizeCategory(definition.category);
    const list = groups.get(category) ?? [];
    list.push(definition);
    groups.set(category, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return PALETTE_CATEGORIES.map((category) => ({
    category,
    icon: CATEGORY_ICONS[category],
    components: groups.get(category) ?? [],
  }));
}
