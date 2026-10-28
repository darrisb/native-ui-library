import type { ComponentRegistry } from "@visual-ui/core";
import type { NativeComponentRegistry } from "@visual-ui/components";

export interface RendererOptions {
  metadataRegistry: ComponentRegistry;
  nativeRegistry: NativeComponentRegistry;
}
