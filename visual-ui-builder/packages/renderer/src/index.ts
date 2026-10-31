export { renderComponent, unmountDataSources } from "./dom/render-component.js";
export type { RendererOptions, RendererMode } from "./types/renderer-options.js";

export { bindActionEvents, detachActionListeners } from "./dom/bind-action-events.js";

export { ActionExecutor } from "./action/execute-action.js";
export type { ActionExecutorOptions } from "./action/execute-action.js";

export {
  BrowserNavigationAdapter,
  type NavigationAdapter,
} from "./action/navigation-adapter.js";

export {
  createRestFetchAdapter,
  type RestFetchAdapter,
  type RestFetchAdapterOptions,
  type RestFetchResult,
  type RestFetchError,
  type RestFetchErrorCode,
  type FetchImpl,
} from "./data-source/rest-fetch-adapter.js";

export {
  DataSourceRuntime,
  createBindingAdapterRegistry,
  getDefaultBindingAdapterRegistry,
  type DataSourceRuntimeOptions,
  type DataBindingAdapter,
  type DataBindingAdapterRegistry,
} from "./data-source/index.js";
