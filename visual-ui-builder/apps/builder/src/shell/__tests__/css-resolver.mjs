// Node module-resolution hook for shell tests.
// - Maps every .css import to an empty module (no CSS processing in tests).
// - Maps .js specifiers that don't resolve to their .ts counterparts, since
//   the source uses .js extensions (Vite convention) but Node needs .ts.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

export async function resolve(specifier, context, nextResolve) {
  // Map .css imports to an empty module via a special URL.
  if (specifier.endsWith(".css")) {
    return {
      shortCircuit: true,
      url: `data:text/javascript,export default {};`,
    };
  }

  // Let Node try the specifier as-is first.
  try {
    return await nextResolve(specifier, context);
  } catch {
    // Fall through to .js -> .ts remap.
  }

  // If it ends in .js, try replacing with .ts relative to the parent module.
  if (specifier.endsWith(".js") && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const parentDir = dirname(parentPath);
    const tsSpecifier = specifier.replace(/\.js$/, ".ts");
    const tsPath = resolvePath(parentDir, tsSpecifier);
    if (existsSync(tsPath)) {
      return {
        shortCircuit: true,
        url: pathToFileURL(tsPath).href,
      };
    }
  }

  // Fall back to default resolution (will likely throw).
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("data:text/javascript")) {
    return {
      shortCircuit: true,
      format: "module",
      source: "export default {};",
    };
  }
  return nextLoad(url, context);
}
