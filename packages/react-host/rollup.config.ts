import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import sourceMaps from 'rollup-plugin-sourcemaps'
import camelCase from 'lodash.camelcase'
import typescript from 'rollup-plugin-typescript2'
import json from 'rollup-plugin-json'
import replace from '@rollup/plugin-replace'

const pkg = require('./package.json')

const libraryName = 'index'

export default {
  input: `src/${libraryName}.ts`,
  output: [
    { file: pkg.main, name: camelCase(libraryName), format: 'umd', sourcemap: true, globals: { react: 'React' } },
    { file: pkg.module, format: 'es', sourcemap: true, globals: { react: 'React' } },
  ],
  // Indicate here external modules you don't want to include in your bundle (i.e.: 'lodash')
  external: ['react'],
  watch: {
    include: 'src/**',
  },
  plugins: [
    // Allow json resolution
    json(),
    replace({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV) 
    }),
    // Compile TypeScript files
    typescript({ useTsconfigDeclarationDir: true }),
    // Allow bundling cjs modules (unlike webpack, rollup doesn't understand cjs)
    commonjs(),
    // Allow node_modules resolution, so you can use 'external' to control
    // which external modules to include in the bundle
    // https://github.com/rollup/rollup-plugin-node-resolve#usage
    resolve(),

    // Resolve source maps to the original source
    sourceMaps(),
  ],
}
