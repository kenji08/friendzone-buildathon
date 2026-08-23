import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Shared message definitions. registerMessages() must run once at module load
 * on both sides, so never call it conditionally or inside a function.
 */
export const Messages = {
  // Client -> Server
  contribute: Schemas.Map({}),

  // Server -> Client
  contributed: Schemas.Map({ total: Schemas.Int })
}

export const room = registerMessages(Messages)
