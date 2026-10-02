// Type-only fallback so `import { createStore } from './store'` type-checks.
// At runtime Metro resolves store.native.ts or store.web.ts instead.
export { createStore } from './store.native';
