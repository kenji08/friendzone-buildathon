import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import {
  CARRY_DURATION,
  CARRY_TO_WIN,
  INTERMISSION_DURATION,
  LEADERBOARD_KEEP,
  LEADERBOARD_SIZE,
  MAX_CARRIED,
  ORB_COUNT,
  ORB_SPAWNS,
  PICKUP_RANGE
} from '../shared/config'
import { room } from '../shared/messages'
import {
  HEARTBEAT_INTERVAL,
  Leaderboard,
  LeaderboardEntry,
  Orb,
  PHASE_INTERMISSION,
  PHASE_PLAYING,
  Pulse,
  SharedState,
  SyncId,
  protectState
} from '../shared/schemas'

const ROUNDS_KEY = 'rounds'
const BOARD_KEY = 'leaderboard'

/** 表示名の上限。長すぎる名前でUIが壊れるのを防ぐ */
const MAX_NAME_LENGTH = 18
const SAVE_INTERVAL = 15
const CARRY_CHECK_INTERVAL = 0.25

let stateEntity = engine.addEntity()
const orbs: Entity[] = []

/**
 * 勝利数の集計。メモリ上を正として扱い、決着のたびに保存する。
 * サーバーは無人になると停止するので、起動時に必ず読み戻す。
 */
const wins = new Map<string, number>()

/** アドレスごとの表示名。クライアントから受け取る */
const names = new Map<string, string>()

let sinceLastBeat = 0
let sinceLastSave = 0
let sinceLastCarryCheck = 0
let dirty = false

/**
 * 同期とメッセージ受付を同期的に立ち上げてから、保存データの復元を後追いで行う。
 * Storage の await を初期化の手前に置くと、それが返るまでシーンが無反応になる。
 */
export function initServer() {
  console.log('[SERVER] starting…')

  stateEntity = engine.addEntity()
  Transform.create(stateEntity, { position: Vector3.create(0, 0, 0) })
  Pulse.create(stateEntity, { heartbeat: Date.now() })
  SharedState.create(stateEntity, {
    rounds: 0,
    lastWinner: '',
    phase: PHASE_PLAYING,
    roundStartsAt: 0
  })
  Leaderboard.create(stateEntity, { json: '[]' })
  syncEntity(
    stateEntity,
    [Pulse.componentId, SharedState.componentId, Leaderboard.componentId],
    SyncId.SHARED_STATE
  )

  for (let i = 0; i < ORB_COUNT; i++) {
    const orb = engine.addEntity()
    Transform.create(orb, { position: spawnFor(i) })
    Orb.create(orb, { index: i, carrier: '', pickedUpAt: 0 })
    syncEntity(orb, [Transform.componentId, Orb.componentId], SyncId.ORB_BASE + i)
    orbs.push(orb)
  }

  protectState()

  room.onMessage('pickup', (data, context) => {
    if (!context) return // サーバーが受け取ったものだけ扱う
    tryPickup(data.index, context.from)
  })

  // 名前は表示用のラベルとしてのみ使う。身元は context.from が正
  room.onMessage('register', (data, context) => {
    if (!context) return
    const name = sanitizeName(data.name)
    if (name === '') return

    const address = context.from
    if (names.get(address) === name) return

    names.set(address, name)
    if (wins.has(address)) publishLeaderboard()
  })

  engine.addSystem(heartbeatSystem)
  engine.addSystem(roundSystem)
  engine.addSystem(carryTimerSystem)
  engine.addSystem(saveSystem)

  console.log('[SERVER] ready with', ORB_COUNT, 'orbs')

  void restore()
  void restoreBoard()
}

function spawnFor(index: number): Vector3 {
  const p = ORB_SPAWNS[index % ORB_SPAWNS.length]
  return Vector3.create(p.x, p.y, p.z)
}

function phase(): string {
  return SharedState.getOrNull(stateEntity)?.phase ?? PHASE_PLAYING
}

/** クライアントは位置を偽装できるので、拾えるかどうかはサーバー側の座標で判定する */
function tryPickup(index: number, from: string) {
  if (phase() !== PHASE_PLAYING) return

  const orb = orbs[index]
  if (!orb) return

  const state = Orb.getOrNull(orb)
  if (!state || state.carrier !== '') return // 既に誰かが持っている

  const playerPos = positionOf(from)
  if (!playerPos) return

  const orbPos = Transform.getOrNull(orb)?.position
  if (!orbPos) return

  if (Vector3.distance(playerPos, orbPos) > PICKUP_RANGE) return
  if (carriedCount(from) >= MAX_CARRIED) return

  const mutable = Orb.getMutableOrNull(orb)
  if (!mutable) return
  mutable.carrier = from
  mutable.pickedUpAt = Date.now()

  room.send('pickedUp', { index, carrier: from })
  console.log('[SERVER] orb', index, 'picked up by', from)

  if (carriedCount(from) >= CARRY_TO_WIN) declareWin(from)
}

/**
 * Phase 1 の暫定ルール。1人が規定数を同時に持てば決着。
 * 決着したら休憩に入り、そのあいだに球を初期位置へ戻す。
 */
function declareWin(winner: string) {
  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return

  state.rounds += 1
  state.lastWinner = winner
  state.phase = PHASE_INTERMISSION
  state.roundStartsAt = Date.now() + INTERMISSION_DURATION * 1000

  const total = (wins.get(winner) ?? 0) + 1
  wins.set(winner, total)
  publishLeaderboard()

  console.log('[SERVER] win by', winner, '— round', state.rounds, '/ wins', total)
  room.send('won', { winner, rounds: state.rounds })

  releaseOrbs()
  void saveBoard()
  void saveRounds()
}

/** 休憩が明けたら球を配置し直して次のラウンドを始める */
function roundSystem() {
  const state = SharedState.getOrNull(stateEntity)
  if (!state || state.phase !== PHASE_INTERMISSION) return
  if (Date.now() < state.roundStartsAt) return

  resetOrbs()

  const mutable = SharedState.getMutableOrNull(stateEntity)
  if (!mutable) return
  mutable.phase = PHASE_PLAYING
  mutable.roundStartsAt = 0
  console.log('[SERVER] round', mutable.rounds + 1, 'begins')
}

/** 持ち主だけ解除する。位置は休憩明けに戻す */
function releaseOrbs() {
  for (const orb of orbs) {
    const state = Orb.getMutableOrNull(orb)
    if (!state) continue
    state.carrier = ''
    state.pickedUpAt = 0
  }
}

/** 全部の球を初期位置に戻す */
function resetOrbs() {
  for (let i = 0; i < orbs.length; i++) {
    const transform = Transform.getMutableOrNull(orbs[i])
    if (transform) transform.position = spawnFor(i)
  }
}

/**
 * 持ってから一定時間で手を離れ、その人の足元に落ちる。
 *
 * 読み取りは必ず get / getOrNull を使う。getMutable は「変更あり」として
 * 同期対象にマークするので、読むだけのつもりで呼ぶと毎フレーム全球分の
 * 同期が走り、サーバーの実行時間上限を超えて落ちる。
 */
function carryTimerSystem(dt: number) {
  sinceLastCarryCheck += dt
  if (sinceLastCarryCheck < CARRY_CHECK_INTERVAL) return
  sinceLastCarryCheck = 0

  const now = Date.now()

  for (const orb of orbs) {
    const state = Orb.getOrNull(orb)
    if (!state || state.carrier === '') continue
    if (now - state.pickedUpAt < CARRY_DURATION * 1000) continue

    const dropAt = positionOf(state.carrier)
    if (dropAt) {
      const transform = Transform.getMutableOrNull(orb)
      // 地形ができるまでは地面の高さに置く
      if (transform) transform.position = Vector3.create(dropAt.x, dropAt.y + 0.5, dropAt.z)
    }

    const heldFor = Math.round((now - state.pickedUpAt) / 100) / 10

    const mutable = Orb.getMutableOrNull(orb)
    if (!mutable) continue
    const index = mutable.index
    mutable.carrier = ''
    mutable.pickedUpAt = 0
    room.send('dropped', { index })
    console.log('[SERVER] orb', index, 'dropped after', heldFor, 'sec')
  }
}

function carriedCount(address: string): number {
  let count = 0
  for (const orb of orbs) {
    if (Orb.getOrNull(orb)?.carrier === address) count++
  }
  return count
}

/** サーバー側で検証済みのプレイヤー座標。クライアントの自己申告は使わない */
function positionOf(address: string): Vector3 | null {
  const target = address.toLowerCase()
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() !== target) continue
    const transform = Transform.getOrNull(entity)
    return transform ? transform.position : null
  }
  return null
}

/** 勝利数の多い順に並べる */
function ranking(): LeaderboardEntry[] {
  const ranked: LeaderboardEntry[] = []
  for (const [address, count] of wins) {
    ranked.push({ address, name: names.get(address) ?? '', wins: count })
  }
  ranked.sort((a, b) => b.wins - a.wins)
  return ranked
}

/** 上位者だけを載せる。全員分を送ると通信量が膨らむ */
function publishLeaderboard() {
  const board = Leaderboard.getMutableOrNull(stateEntity)
  if (!board) return
  board.json = JSON.stringify(ranking().slice(0, LEADERBOARD_SIZE))
}

/** 名前は表示用なので、長さと改行だけ整える */
function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[\r\n\t]/g, ' ').trim()
  return cleaned.length > MAX_NAME_LENGTH ? cleaned.slice(0, MAX_NAME_LENGTH) : cleaned
}

/** クライアントがサーバーの生存を判断するための鼓動 */
function heartbeatSystem(dt: number) {
  sinceLastBeat += dt
  if (sinceLastBeat < HEARTBEAT_INTERVAL) return
  sinceLastBeat = 0

  const pulse = Pulse.getMutableOrNull(stateEntity)
  if (!pulse) return
  pulse.heartbeat = Date.now()
}

function saveSystem(dt: number) {
  if (!dirty) return
  sinceLastSave += dt
  if (sinceLastSave < SAVE_INTERVAL) return
  sinceLastSave = 0
  dirty = false
  void saveRounds()
}

/**
 * 保存済みの記録を読み戻す。
 *
 * キーが存在しない状態で読むとエラー経路に入り、応答が返らないまま
 * 60秒の async turn 上限に達してサーバーが落ちることがある。
 * 初回起動では必ずキーが無いので、見つからなければその場で作っておく。
 */
async function restore() {
  try {
    const raw = await Storage.get<string>(ROUNDS_KEY)

    if (raw === null || raw === undefined || raw === '') {
      await seed()
      return
    }

    const parsed = parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return

    const state = SharedState.getMutableOrNull(stateEntity)
    if (!state) return
    state.rounds = parsed
    console.log('[SERVER] restored rounds =', parsed)
  } catch (e) {
    console.log('[SERVER] failed to read storage:', e)
    await seed()
  }
}

async function seed() {
  const ok = await Storage.set(ROUNDS_KEY, '0')
  console.log('[SERVER] seeded rounds key:', ok)
}

async function saveRounds() {
  const state = SharedState.getOrNull(stateEntity)
  if (!state) return

  // set() は例外を投げず false を返す。戻り値を捨てると保存漏れが無言で起きる
  const ok = await Storage.set(ROUNDS_KEY, String(state.rounds))
  if (!ok) {
    console.log('[SERVER] storage write failed — will retry')
    dirty = true
    return
  }
  console.log('[SERVER] saved rounds =', state.rounds)
}

/**
 * リーダーボードは世界全体の記録なので World 側に保存する。
 * サーバーは無人になると停止するため、これが無いと再訪のたびに消える。
 */
async function saveBoard() {
  try {
    const payload = JSON.stringify(ranking().slice(0, LEADERBOARD_KEEP))
    const ok = await Storage.set(BOARD_KEY, payload)
    if (!ok) console.log('[SERVER] failed to save leaderboard')
  } catch (e) {
    console.log('[SERVER] error saving leaderboard:', e)
  }
}

async function restoreBoard() {
  try {
    const raw = await Storage.get<string>(BOARD_KEY)
    if (raw === null || raw === undefined || raw === '') {
      await Storage.set(BOARD_KEY, '[]')
      return
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return

    for (const entry of parsed as LeaderboardEntry[]) {
      if (!entry || typeof entry.address !== 'string') continue
      wins.set(entry.address, entry.wins)
      if (entry.name) names.set(entry.address, entry.name)
    }

    publishLeaderboard()
    console.log('[SERVER] restored leaderboard with', wins.size, 'players')
  } catch (e) {
    console.log('[SERVER] error reading leaderboard:', e)
    await Storage.set(BOARD_KEY, '[]')
  }
}
