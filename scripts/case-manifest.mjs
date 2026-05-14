/**
 * Thin re-export — canonical source of truth lives in app/lib/caseManifest.ts.
 * Node 24 strips TypeScript types natively, so .ts imports work without tsx.
 */
export { MANIFEST, VARIANT_SEEDS } from '../app/lib/caseManifest.ts'
