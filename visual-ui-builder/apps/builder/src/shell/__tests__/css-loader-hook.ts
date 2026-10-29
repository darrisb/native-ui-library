// Registers a module loader hook so CSS imports resolve to an empty module
// and .js specifiers resolve to their .ts counterparts. This lets app-shell.ts
// load under Node's --experimental-strip-types runner without a bundler.
import { register } from "node:module";

register("./css-resolver.mjs", import.meta.url.replace("css-loader-hook.ts", ""));
