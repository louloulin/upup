/**
 * Resource snapshot contract — extracted from `package-catalog` so that
 * `package-contracts` can import the type without inducing a cycle
 * (contracts needs the snapshot type, catalog imports contracts' loader).
 */

export interface PiPackageResourceSnapshot {
  readonly path: string;
  readonly content: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly kind: 'extension' | 'skill' | 'prompt' | 'workflow' | 'policy' | 'eval';
}

export type PiPackageResourceKind = PiPackageResourceSnapshot['kind'];
