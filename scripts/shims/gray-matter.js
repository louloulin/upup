// gray-matter ESM shim.
//
// gray-matter@4 is CJS-only (`main: index.js`, no `exports` map). Consumers in
// this repo write `import matter from 'gray-matter'` and call it as a function.
//
// esbuild is told to alias the bare specifier to *this* file, so importing
// `'gray-matter'` (or any subpath of it) here would recurse through the alias.
// Reach the package through a relative path from `scripts/shims/` instead,
// which the alias never touches.
//
// In the Node bundle `gray-matter` is external, so this shim is a fallback
// that keeps the import resolving to a callable default when it is inlined.
export { default } from '../../node_modules/gray-matter/index.js';
