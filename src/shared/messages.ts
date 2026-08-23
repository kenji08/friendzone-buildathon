import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

/**
 * クライアントとサーバーが共有するメッセージ定義。
 * registerMessages() はモジュール読み込み時に一度だけ走る必要があるため、
 * 関数の中や条件分岐の中で呼ばないこと。
 */
export const Messages = {
  // Client -> Server
  contribute: Schemas.Map({}),

  // Server -> Client
  serverReady: Schemas.Map({ startedAt: Schemas.Int64 }),
  contributed: Schemas.Map({ total: Schemas.Int })
}

export const room = registerMessages(Messages)
