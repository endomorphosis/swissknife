const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const typescript = require('@rollup/plugin-typescript');
const terser = require('@rollup/plugin-terser');
const pkg = require('./package.json');

// Banner to add to the top of each file
const banner = `/**
 * IPFS Accelerate JS SDK v${pkg.version}
 * ${pkg.description}
 * 
 * @license ${pkg.license}
 * @copyright IPFS Accelerate Team
 */`;

module.exports = [
  // Browser-friendly UMD build
  {
    input: 'src/index.ts',
    output: {
      name: 'IPFSAccelerate',
      file: pkg.main,
      format: 'umd',
      sourcemap: true,
      banner
    },
    plugins: [
      resolve(), 
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      terser({
        format: {
          comments: function(node, comment) {
            return comment.type === 'comment2' && /@license/i.test(comment.value);
          }
        }
      })
    ]
  },
  
  // ESM build for modern bundlers
  {
    input: 'src/index.ts',
    output: {
      file: pkg.module,
      format: 'es',
      sourcemap: true,
      banner
    },
    plugins: [
      resolve(),
      typescript({ tsconfig: './tsconfig.json' })
    ],
    external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]
  },
  
  // Individual model builds
  {
    input: 'src/model/transformers/bert.ts',
    output: {
      file: 'dist/models/bert.js',
      format: 'es',
      sourcemap: true,
      banner
    },
    plugins: [
      resolve(),
      typescript({ tsconfig: './tsconfig.json' })
    ],
    external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]
  }
];