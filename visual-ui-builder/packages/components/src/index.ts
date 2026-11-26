export { UIButton, registerUIButton } from "./button/ui-button.js";
export { UICard, registerUICard } from "./card/ui-card.js";
export { UIText, registerUIText } from "./text/ui-text.js";
export { UIDropdown, registerUIDropdown } from "./dropdown/ui-dropdown.js";
export { UIInput, registerUIInput } from "./input/ui-input.js";

export {
  getNativeComponentRegistry,
  NativeComponentRegistry,
  registerButton,
  registerCard,
  registerDropdown,
  registerInput,
  registerNativeComponents,
  registerText,
} from "./registry/index.js";

export {
  validateComponentInstance,
  type ValidationError,
} from "./validation/validate-instance.js";

export function initializeComponents(): void {
  // Component registration will be implemented in future tasks.
}
