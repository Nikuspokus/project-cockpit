// Bundle l'extension en un seul fichier CommonJS (dist/extension.js).
// "bundle" = esbuild fusionne tous les imports en un fichier ; "vscode" reste
// externe car VS Code l'injecte à l'exécution.
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  minify: !watch,
  sourcemap: watch,
  logLevel: 'info',
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
})().catch(() => process.exit(1));
