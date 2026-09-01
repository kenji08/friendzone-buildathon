import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * Shared message definitions. registerMessages() must run once at module load
 * on both sides, so never call it conditionally or inside a function.
 */
export const Messages = {
  // Client -> Server
  pickup: Schemas.Map({ index: Schemas.Int }),
  /**
   * 表示名を伝える。サーバー側からは名前を読めないため。
   * 身元は context.from（検証済みアドレス）を使い、名前は表示用のラベルとしてのみ扱う。
   */
  register: Schemas.Map({ name: Schemas.String }),

  // Server -> Client
  pickedUp: Schemas.Map({ index: Schemas.Int, carrier: Schemas.String }),
  dropped: Schemas.Map({ index: Schemas.Int }),
  won: Schemas.Map({ winner: Schemas.String, rounds: Schemas.Int })
}

export const room = registerMessages(Messages)
