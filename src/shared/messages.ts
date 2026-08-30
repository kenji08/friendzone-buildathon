import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Shared message definitions. registerMessages() must run once at module load
 * on both sides, so never call it conditionally or inside a function.
 */
export const Messages = {
  // Client -> Server
  pickup: Schemas.Map({ index: Schemas.Int }),

  // Server -> Client
  pickedUp: Schemas.Map({ index: Schemas.Int, carrier: Schemas.String }),
  dropped: Schemas.Map({ index: Schemas.Int })
}

export const room = registerMessages(Messages)
