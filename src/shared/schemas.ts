import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** 同期エンティティのIDは全クライアントで一致している必要がある。8001未満を使う。 */
export enum SyncId {
  SHARED_STATE = 1
}

/** サーバーが生きていると判断する猶予（秒）。ハートビート間隔の3倍を見る。 */
export const HEARTBEAT_INTERVAL = 2
export const HEARTBEAT_TIMEOUT = 6

/**
 * 全員で共有する状態。サーバーだけが書き換えられる。
 * heartbeat はサーバーの生存確認用で、2秒ごとに更新される。
 */
export const SharedState = engine.defineComponent('friendzone:SharedState', {
  total: Schemas.Int,
  heartbeat: Schemas.Int64
})

/** クライアントからの書き込みを一切受け付けない（サーバー権威） */
export function protectSharedState() {
  if (!isServer()) return
  SharedState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
}
