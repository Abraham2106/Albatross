import { build } from 'esbuild';
await build({
  entryPoints: ['electron/main.cts', 'electron/preload.cts'],
  outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  loader: { '.cts': 'ts' }, resolveExtensions: ['.cts', '.ts', '.js', '.cjs'],
  packages: 'external', sourcemap: true,
});
