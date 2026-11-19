/**
 * Action event wiring for the recursive JSON renderer.
 *
 * When the renderer is running in interactive mode, this module attaches
 * declarative action listeners to rendered elements using the component
 * definition's supported event metadata. It is a no-op in edit mode so the
 * builder canvas and other existing callers are unaffected.
 *
 * Safety contract:
 *   - Only events declared in the component definition's `events` metadata
 *     are ever bound, preventing arbitrary event binding.
 *   - Listeners call `event.stopPropagation()` so a nested child's action
 *     does not also trigger a parent's action (nested event isolation).
 *   - Each (element, event) pair tracks its listener so repeated binding
 *     attempts do not produce duplicate listeners across rerenders.
 *   - `detachActionListeners` removes every listener that was attached,
 *     enabling clean teardown.
 */

import type { ComponentDefinition, ComponentInstance } from "@visual-ui/core";
import type { ActionExecutor } from "../action/execute-action.js";
import type { RendererMode } from "../types/renderer-options.js";

/** Key under which listener records are stored on an element. */
const LISTENER_KEY = "__uiActionListeners";

interface ListenerRecord {
  /** DOM event name, e.g. "click". */
  readonly event: string;
  /** The actual listener bound via addEventListener. */
  readonly listener: (event: Event) => void;
}

/**
 * Reads the listener records stored on an element, or `undefined` when none
 * have been attached yet.
 */
function getListenerRecords(element: HTMLElement): ListenerRecord[] | undefined {
  return (element as unknown as Record<string, unknown>)[LISTENER_KEY] as
    | ListenerRecord[]
    | undefined;
}

/**
 * Stores the listener records on an element.
 */
function setListenerRecords(
  element: HTMLElement,
  records: ListenerRecord[]
): void {
  (element as unknown as Record<string, unknown>)[LISTENER_KEY] = records;
}

/**
 * Determines whether the given event name is one that the component
 * definition supports binding actions to.
 */
function isSupportedEvent(
  definition: ComponentDefinition | undefined,
  event: string
): boolean {
  if (!definition?.events) {
    return false;
  }
  return definition.events.some(
    (capability) => capability.event === event
  );
}

/**
 * Attaches declarative action listeners to a rendered element.
 *
 * Only acts in interactive mode and only for events declared in the component
 * definition's metadata. Each listener stops propagation so parent elements
 * with their own action bindings are not triggered by a nested child event.
 *
 * Listener records stored on the element prevent duplicate bindings if this
 * function is called again for the same element (e.g. across rerenders of a
 * shared element reference).
 *
 * @param element   The rendered native element to attach listeners to.
 * @param instance  The component instance carrying the actions.
 * @param definition The component definition providing event metadata.
 * @param executor  The action executor used to dispatch actions.
 * @param mode      Renderer mode; no listeners are attached in edit mode.
 */
export function bindActionEvents(
  element: HTMLElement,
  instance: ComponentInstance,
  definition: ComponentDefinition | undefined,
  executor: ActionExecutor,
  mode: RendererMode | undefined
): void {
  // In edit mode, or when there are no actions, nothing to bind.
  if (mode !== "interactive") {
    return;
  }

  const actions = instance.actions;
  if (!actions || actions.length === 0) {
    return;
  }

  const existing = getListenerRecords(element) ?? [];
  const boundEvents = new Set(existing.map((record) => record.event));
  const records = [...existing];

  for (const action of actions) {
    const eventName = action.event;

    // Only bind events the component explicitly supports.
    if (!isSupportedEvent(definition, eventName)) {
      continue;
    }

    // Prevent duplicate listeners for the same event on the same element.
    if (boundEvents.has(eventName)) {
      continue;
    }

    const listener = (event: Event) => {
      // Stop the event from bubbling to parent elements so that a nested
      // child's action does not also trigger a parent's action.
      event.stopPropagation();
      executor.execute(action, event, element);
    };

    element.addEventListener(eventName, listener);
    records.push({ event: eventName, listener });
    boundEvents.add(eventName);
  }

  setListenerRecords(element, records);
}

/**
 * Removes every action listener previously attached to an element by
 * {@link bindActionEvents}. Safe to call even when no listeners were attached.
 *
 * @param element The rendered native element to detach listeners from.
 */
export function detachActionListeners(element: HTMLElement): void {
  const records = getListenerRecords(element);
  if (!records) {
    return;
  }

  for (const { event, listener } of records) {
    element.removeEventListener(event, listener);
  }

  delete (element as unknown as Record<string, unknown>)[LISTENER_KEY];
}
