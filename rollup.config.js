// @file: rollup.config.js
import dts from 'rollup-plugin-dts'
const config = [
  // your default rollup config for transpilation and bundling
  // ...
  {
    // path to your declaration files root
    input: './dist/cjs/types/contexts.d.ts',
    output: [{ file: './dist/dts/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
]
export default config