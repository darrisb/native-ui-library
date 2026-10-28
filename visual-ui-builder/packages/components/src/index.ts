export { UIButton, registerUIButton } from "./button/ui-button.js";
export { UICard, registerUICard } from "./card/ui-card.js";
export { UIText, registerUIText } from "./text/ui-text.js";

export {
  getNativeComponentRegistry,
  NativeComponentRegistry,
  registerButton,
  registerCard,
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
