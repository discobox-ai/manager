import { createArtifactStore } from './artifact.ts'
import { createBoxStore } from './box.ts'
import type { Store } from './types.ts'

export type * from './types.ts'

/** Which host this build runs on: `vite build --mode artifact` makes the claude.ai artifact. */
export const host: Store['host'] = import.meta.env.MODE === 'artifact' ? 'artifact' : 'box'

// The other host's store is dead code in each build, and drops out of the bundle.
export const store: Store = host === 'artifact' ? createArtifactStore() : createBoxStore()
