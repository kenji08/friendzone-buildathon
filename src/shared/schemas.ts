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
 * ラウンドの状態。
 * 募集中は時間制限を置かない。初めて来た人がルールを読む時間になる。
 */
export const PHASE_WAITING = 'waiting'
export const PHASE_STARTING = 'starting'
export const PHASE_PLAYING = 'playing'
export const PHASE_RESULT = 'result'

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

/**
 * コンポーネントは更新頻度で分ける。
 * 変更のたびにそのコンポーネントのデータ全体が送られるため、
 * 2秒ごとに動く鼓動と、勝利時にしか変わらない記録を同居させると無駄が出る。
 */

/** サーバーの生存確認だけを載せる。2秒ごとに更新される */
export const Pulse = engine.defineComponent('friendzone:Pulse', {
  heartbeat: Schemas.Int64
})

/** ラウンドの進行。決着のたびにしか変わらない */
export const SharedState = engine.defineComponent('friendzone:SharedState', {
  rounds: Schemas.Int,
  lastWinner: Schemas.String,
  phase: Schemas.String,
  /** 次のラウンドが始まる時刻。休憩中のカウントダウンに使う */
  roundStartsAt: Schemas.Int64
})

/** 上位者の一覧。JSON文字列で持つ。勝利時にしか変わらない */
export const Leaderboard = engine.defineComponent('friendzone:Leaderboard', {
  json: Schemas.String
})

/** いまラウンドに参加している人。参加・離脱の時だけ変わる */
export const Participants = engine.defineComponent('friendzone:Participants', {
  json: Schemas.String
})

export type Participant = { address: string; name: string; carrying: number }

export type LeaderboardEntry = { address: string; name: string; wins: number }

/** クライアントからの書き込みを一切受け付けない（サーバー権威） */
export function protectState() {
  if (!isServer()) return
  const fromServer = (value: { senderAddress: string }) =>
    value.senderAddress === AUTH_SERVER_PEER_ID

  Pulse.validateBeforeChange(fromServer)
  SharedState.validateBeforeChange(fromServer)
  Leaderboard.validateBeforeChange(fromServer)
  Participants.validateBeforeChange(fromServer)
  Orb.validateBeforeChange(fromServer)
}
