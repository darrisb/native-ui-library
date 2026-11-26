export type { BuilderNode } from "./builder-node.js";
export { createNode } from "./builder-node.js";

export type {
  ComponentDefinition,
  ComponentEventCapability
} from "./types/component-definition.js";
export type {
  ComponentPropertyDefinition,
  ComponentPropertyType
} from "./types/component-property.js";
export type { ComponentInstance } from "./types/component-instance.js";

export type {
  ActionEvent,
  ComponentAction,
  NavigateAction,
  NavigateConfig,
  NavigateTarget
} from "./types/action.js";
export { NAVIGATE_VALUE_TOKEN } from "./types/action.js";

export type {
  DataSource,
  DataSourceLoadOn,
  DataSourceMethod,
  DataSourceRuntimeState,
  DataMapping,
  RestDataSource,
  StaticDataSource
} from "./types/data-source.js";
export { buildRestUrl, isValidDataPath } from "./types/data-source.js";

export type { Binding, BindingTarget } from "./types/binding.js";

export { ComponentRegistry } from "./registry/component-registry.js";

export {
  buttonDefinition,
  cardDefinition,
  dropdownDefinition,
  inputDefinition,
  registerSampleDefinitions,
  sampleDefinitions,
  tableDefinition,
  textDefinition
} from "./definitions/sample-definitions.js";

export type { ActionValidationIssue } from "./validation/validate-action.js";
export { validateActions } from "./validation/validate-action.js";

export {
  ALLOWED_URL_SCHEMES,
  BLOCKED_URL_SCHEMES,
  extractUrlScheme,
  isAllowedUrl
} from "./validation/url-safety.js";

export type { DataSourceValidationIssue } from "./validation/validate-data-source.js";
export { validateDataSourceContracts } from "./validation/validate-data-source.js";

export {
  FILTER_FIELD_PATTERN,
  FILTER_MODES,
  isValidFilterField,
  validateFilterLinks
} from "./validation/validate-filter.js";
export type { FilterMode } from "./validation/validate-filter.js";

export type {
  ResolveResponsePathErrorCode,
  ResolveResponsePathError,
  ResolveResponsePathSuccess,
  ResolveResponsePathFailure,
  ResolveResponsePathResult
} from "./data/resolve-response-path.js";
export {
  parseResponsePath,
  resolveResponsePath
} from "./data/resolve-response-path.js";

export type {
  MapRecordsErrorCode,
  MapRecordsError,
  MapRecordsSuccess,
  MapRecordsFailure,
  MapRecordsResult,
  DropdownOption,
  MappedRecord
} from "./data/map-response-records.js";
export {
  mapRecords,
  mapDropdownOptions,
  extractAndMapRecords
} from "./data/map-response-records.js";

export type { DropdownOption as StaticDropdownOption } from "./data/parse-static-options.js";
export { parseStaticOptions } from "./data/parse-static-options.js";

export type { TableColumn } from "./data/parse-table-columns.js";
export { parseTableColumns } from "./data/parse-table-columns.js";
