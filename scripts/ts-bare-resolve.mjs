/** Node loader: resolve extensionless relative imports to .ts (for --experimental-strip-types). */
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function existing(candidates) {
  return candidates.find(file => existsSync(file));
}

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('.') || !context.parentURL) {
    return nextResolve(specifier, context);
  }
  const parentDir = dirname(fileURLToPath(context.parentURL));
  const absolute = join(parentDir, specifier);
  if (extname(absolute)) return nextResolve(specifier, context);
  const file = existing([
    `${absolute}.ts`,
    `${absolute}.js`,
    join(absolute, 'index.ts'),
    join(absolute, 'index.js'),
  ]);
  if (!file) return nextResolve(specifier, context);
  return nextResolve(pathToFileURL(file).href, context);
}
