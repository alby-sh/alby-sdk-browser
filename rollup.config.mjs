import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import nodeResolve from '@rollup/plugin-node-resolve'
import dts from 'rollup-plugin-dts'

const terserOpts = {
  compress: { passes: 2, pure_getters: true, unsafe: true, unsafe_arrows: true },
  mangle: { properties: false },
  format: { comments: false },
}

const plugins = (declaration = false) => [
  nodeResolve({ browser: true }),
  typescript({
    tsconfig: './tsconfig.json',
    declaration,
    declarationDir: declaration ? './dist/types' : undefined,
    sourceMap: true,
    inlineSources: true,
    exclude: ['test/**/*', 'e2e/**/*'],
  }),
  terser(terserOpts),
]

export default [
  // IIFE for <script> tag usage.
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/alby.iife.js',
      format: 'iife',
      name: 'Alby',
      sourcemap: true,
      extend: true,
      // Expose the default export (the Alby singleton) as the global.
      footer: 'window.Alby = Alby.default || Alby;',
    },
    plugins: plugins(false),
  },
  // ESM.
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/alby.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: plugins(false),
  },
  // CJS.
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/alby.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    plugins: plugins(false),
  },
  // Types bundle.
  {
    input: 'src/index.ts',
    output: { file: 'dist/alby.d.ts', format: 'es' },
    plugins: [dts()],
  },
]
