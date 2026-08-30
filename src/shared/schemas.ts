import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** 同期エンティティのIDは全クライアントで一致させる。8001未満を使う。 */
export enum SyncId {
  SHARED_STATE = 1,
  ORB_BASE = 10 // 球は 10, 11, 12... と連番で使う
}

export const HEARTBEAT_INTERVAL = 2
export const HEARTBEAT_TIMEOUT = 6

/**
 * 球の状態。位置は Transform 側で持つ。
 * carrier が空文字なら地面に落ちている。誰かが持っていればそのウォレットアドレス。
 *
 * 持たれている間の位置は同期しない。毎フレーム位置を送ると通信量が跳ね上がるため、
 * 追従の見た目は各クライアントがローカルで描く。
 */
export const Orb = engine.defineComponent('friendzone:Orb', {
  index: Schemas.Int,
  carrier: Schemas.String,
  /** 持たれ始めた時刻。落ちるまでの残り時間の計算に使う */
  pickedUpAt: Schemas.Int64
})

/** 全員で共有する世界の状態 */
export const SharedState = engine.defineComponent('friendzone:SharedState', {
  /** サーバーの生存確認 */
  heartbeat: Schemas.Int64,
  /** これまでに決着した回数 */
  rounds: Schemas.Int
})

/** クライアントからの書き込みを一切受け付けない（サーバー権威） */
export function protectState() {
  if (!isServer()) return
  SharedState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  Orb.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
}
