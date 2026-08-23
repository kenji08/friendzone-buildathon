import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** 同期エンティティのIDは全クライアントで一致している必要がある。8001未満を使う。 */
export enum SyncId {
  SHARED_STATE = 1
}

/**
 * 全員で共有する状態。サーバーだけが書き換えられる。
 * 変更のたびにコンポーネント全体が送信されるので、更新頻度の違うデータは分けること。
 */
export const SharedState = engine.defineComponent('friendzone:SharedState', {
  total: Schemas.Int,
  updatedAt: Schemas.Int64
})

/** クライアントからの書き込みを一切受け付けない（サーバー権威） */
export function protectSharedState() {
  if (!isServer()) return
  SharedState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
}
