import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import {
  BUMP_COOLDOWN,
  BUMP_RADIUS,
  BUMP_SCATTER,
  CARRY_TO_WIN,
  JOIN_WINDOW,
  LEADERBOARD_KEEP,
  LEADERBOARD_SIZE,
  MAX_CARRIED,
  MAX_PARTICIPANTS,
  ORB_COUNT,
  PICKUP_RANGE,
  RESULT_DURATION
} from '../shared/config'
import { room } from '../shared/messages'
import { SPAWN_AREA } from '../shared/config'
import { onGround, pickSpawns } from '../shared/spawns'
import {
  HEARTBEAT_INTERVAL,
  Leaderboard,
  LeaderboardEntry,
  Orb,
  PHASE_PLAYING,
  PHASE_RESULT,
  PHASE_STARTING,
  PHASE_WAITING,
  Participant,
  Participants,
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

/** 接触の判定を回す間隔（秒）。毎フレーム全員分を突き合わせる必要はない */
const BUMP_CHECK_INTERVAL = 0.2

let stateEntity = engine.addEntity()
const orbs: Entity[] = []

/**
 * 勝利数の集計。メモリ上を正として扱い、決着のたびに保存する。
 * サーバーは無人になると停止するので、起動時に必ず読み戻す。
 */
const wins = new Map<string, number>()

/** アドレスごとの表示名。クライアントから受け取る */
const names = new Map<string, string>()

/**
 * いまラウンドに参加している人。
 * シーンに居ることと参加していることは別物として扱う。
 * 観戦したい人がシーンを出る必要がないようにするため。
 */
const participants = new Set<string>()

/** 次にフェーズが切り替わる時刻 */
let phaseEndsAt = 0

/** 誰と誰が、いつぶつかったか。同じ組で連続して発火させないために持つ */
const lastBump = new Map<string, number>()

let sinceLastBump = 0
let sinceLastBeat = 0
let sinceLastSave = 0
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
    phase: PHASE_WAITING,
    roundStartsAt: 0
  })
  Leaderboard.create(stateEntity, { json: '[]' })
  Participants.create(stateEntity, { json: '[]' })
  syncEntity(
    stateEntity,
    [
      Pulse.componentId,
      SharedState.componentId,
      Leaderboard.componentId,
      Participants.componentId
    ],
    SyncId.SHARED_STATE
  )

  rollSpawns()

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
    if (participants.has(address)) publishParticipants()
  })

  room.onMessage('join', (_data, context) => {
    if (!context) return
    tryJoin(context.from)
  })

  room.onMessage('leave', (_data, context) => {
    if (!context) return
    leaveRound(context.from)
  })

  engine.addSystem(heartbeatSystem)
  engine.addSystem(bumpSystem)
  engine.addSystem(presenceSystem)
  engine.addSystem(roundSystem)
  engine.addSystem(saveSystem)

  console.log('[SERVER] ready with', ORB_COUNT, 'orbs')

  void restore()
  void restoreBoard()
}

/** そのラウンドの配置。ラウンドが始まるたびに引き直す */
let spawns: Vector3[] = []

function rollSpawns() {
  spawns = pickSpawns(ORB_COUNT)
}

function spawnFor(index: number): Vector3 {
  const p = spawns[index] ?? spawns[0]
  return Vector3.create(p.x, p.y, p.z)
}

function phase(): string {
  return SharedState.getOrNull(stateEntity)?.phase ?? PHASE_WAITING
}

/** クライアントは位置を偽装できるので、拾えるかどうかはサーバー側の座標で判定する */
function tryPickup(index: number, from: string) {
  if (phase() !== PHASE_PLAYING) return
  if (!participants.has(from)) return // 観戦者は球に触れない

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
  publishParticipants()

  if (carriedCount(from) >= CARRY_TO_WIN) declareWin(from)
}

/**
 * 規定数を同時に持てば決着。参加者だけが対象。
 */
function declareWin(winner: string) {
  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return

  state.rounds += 1
  state.lastWinner = winner
  state.phase = PHASE_RESULT
  state.roundStartsAt = 0
  phaseEndsAt = Date.now() + RESULT_DURATION * 1000

  const total = (wins.get(winner) ?? 0) + 1
  wins.set(winner, total)
  publishLeaderboard()

  const name = names.get(winner) ?? ''
  console.log('[SERVER] win by', name || winner, '— round', state.rounds, '/ wins', total)
  room.send('won', { winner, name, rounds: state.rounds })

  releaseOrbs()
  publishParticipants()
  void saveBoard()
  void saveRounds()
}

/** 枠が空いていれば参加させる。募集中と開始待ちの間だけ受け付ける */
function tryJoin(address: string) {
  if (participants.has(address)) return

  const state = SharedState.getOrNull(stateEntity)
  if (!state) return

  if (state.phase !== PHASE_WAITING && state.phase !== PHASE_STARTING) {
    room.send('joinRejected', { reason: 'round in progress' }, { to: [address] })
    return
  }

  if (participants.size >= MAX_PARTICIPANTS) {
    room.send('joinRejected', { reason: 'round is full' }, { to: [address] })
    return
  }

  participants.add(address)
  publishParticipants()
  console.log('[SERVER] joined:', names.get(address) ?? address, `(${participants.size})`)

  // 最初の1人が入ったら、他の人を待つ猶予を置いてから始める
  if (state.phase === PHASE_WAITING) {
    const mutable = SharedState.getMutableOrNull(stateEntity)
    if (!mutable) return
    mutable.phase = PHASE_STARTING
    mutable.roundStartsAt = Date.now() + JOIN_WINDOW * 1000
    phaseEndsAt = mutable.roundStartsAt
  }
}

/**
 * ラウンドから抜ける。シーンからは出ない。
 * 持っていた球はその場に落とす。
 */
function leaveRound(address: string) {
  if (!participants.delete(address)) return

  dropCarriedBy(address)
  publishParticipants()
  console.log('[SERVER] left:', names.get(address) ?? address, `(${participants.size})`)

  if (participants.size === 0) backToWaiting()
}

function dropCarriedBy(address: string) {
  const dropAt = positionOf(address)
  for (const orb of orbs) {
    if (Orb.getOrNull(orb)?.carrier !== address) continue

    if (dropAt) {
      const transform = Transform.getMutableOrNull(orb)
      if (transform) transform.position = onGround(dropAt.x, dropAt.z)
    }

    const mutable = Orb.getMutableOrNull(orb)
    if (!mutable) continue
    mutable.carrier = ''
    mutable.pickedUpAt = 0
  }
}

function backToWaiting() {
  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return
  state.phase = PHASE_WAITING
  state.roundStartsAt = 0
  phaseEndsAt = 0
  releaseOrbs()
  resetOrbs()
}

/** シーンから居なくなった人を参加者から外す。放置すると枠が埋まったままになる */
function presenceSystem() {
  if (participants.size === 0) return

  const present = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    present.add(identity.address)
  }

  let changed = false
  for (const address of participants) {
    if (present.has(address)) continue
    participants.delete(address)
    dropCarriedBy(address)
    changed = true
    console.log('[SERVER] dropped absent participant:', address)
  }

  if (!changed) return
  publishParticipants()
  if (participants.size === 0) backToWaiting()
}

/**
 * 参加者同士がぶつかったら、多く持っている方が1個落とす。
 *
 * どちらが「ぶつけた側」かはサーバーからは判定できないので、
 * 持っている数で決める。先行している人ほど狙われる形になり、
 * 差が開いたまま終わらない。
 */
function bumpSystem(dt: number) {
  sinceLastBump += dt
  if (sinceLastBump < BUMP_CHECK_INTERVAL) return
  sinceLastBump = 0

  if (phase() !== PHASE_PLAYING) return
  if (participants.size < 2) return

  const positions = new Map<string, Vector3>()
  for (const address of participants) {
    const p = positionOf(address)
    if (p) positions.set(address, p)
  }

  const now = Date.now()
  const addresses = Array.from(positions.keys())

  for (let i = 0; i < addresses.length; i++) {
    for (let k = i + 1; k < addresses.length; k++) {
      const a = addresses[i]
      const b = addresses[k]

      const pa = positions.get(a)
      const pb = positions.get(b)
      if (!pa || !pb) continue
      if (Vector3.distance(pa, pb) > BUMP_RADIUS) continue

      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (now - (lastBump.get(key) ?? 0) < BUMP_COOLDOWN * 1000) continue
      lastBump.set(key, now)

      const countA = carriedCount(a)
      const countB = carriedCount(b)

      // 同数なら両方。そうでなければ多い方だけが落とす
      if (countA >= countB && countA > 0) scatterOne(a)
      if (countB >= countA && countB > 0) scatterOne(b)
    }
  }
}

/** 持っている球を1つ、少し離れた場所へ弾き飛ばす */
function scatterOne(address: string) {
  for (const orb of orbs) {
    const state = Orb.getOrNull(orb)
    if (!state || state.carrier !== address) continue

    const from = positionOf(address)
    if (from) {
      const angle = Math.random() * Math.PI * 2
      const x = clampToArea(from.x + Math.cos(angle) * BUMP_SCATTER)
      const z = clampToArea(from.z + Math.sin(angle) * BUMP_SCATTER)

      const transform = Transform.getMutableOrNull(orb)
      if (transform) transform.position = onGround(x, z)
    }

    const mutable = Orb.getMutableOrNull(orb)
    if (!mutable) return
    const index = mutable.index
    mutable.carrier = ''
    mutable.pickedUpAt = 0

    room.send('dropped', { index })
    publishParticipants()
    console.log('[SERVER] bump: ', names.get(address) ?? address, 'dropped orb', index)
    return // 1回につき1個だけ
  }
}

function clampToArea(v: number): number {
  return Math.min(SPAWN_AREA.max, Math.max(SPAWN_AREA.min, v))
}

/** 参加者の一覧を配る。参加・離脱・増減の時だけ更新する */
function publishParticipants() {
  const list: Participant[] = []
  for (const address of participants) {
    list.push({
      address,
      name: names.get(address) ?? '',
      carrying: carriedCount(address)
    })
  }

  const component = Participants.getMutableOrNull(stateEntity)
  if (!component) return
  component.json = JSON.stringify(list)
}

/** 時間で切り替わるフェーズを進める */
function roundSystem() {
  const state = SharedState.getOrNull(stateEntity)
  if (!state) return
  if (phaseEndsAt === 0 || Date.now() < phaseEndsAt) return

  if (state.phase === PHASE_STARTING) {
    resetOrbs()
    const mutable = SharedState.getMutableOrNull(stateEntity)
    if (!mutable) return
    mutable.phase = PHASE_PLAYING
    mutable.roundStartsAt = 0
    phaseEndsAt = 0
    console.log('[SERVER] round begins with', participants.size, 'players')
    return
  }

  if (state.phase === PHASE_RESULT) {
    // 参加者はそのまま残す。続けて遊びたい人が押し直さずに済むように
    if (participants.size === 0) {
      backToWaiting()
      return
    }

    resetOrbs()
    const mutable = SharedState.getMutableOrNull(stateEntity)
    if (!mutable) return
    mutable.phase = PHASE_STARTING
    mutable.roundStartsAt = Date.now() + JOIN_WINDOW * 1000
    phaseEndsAt = mutable.roundStartsAt
  }
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

/** 球を配置し直す。ラウンドごとに場所が変わる */
function resetOrbs() {
  rollSpawns()
  for (let i = 0; i < orbs.length; i++) {
    const transform = Transform.getMutableOrNull(orbs[i])
    if (transform) transform.position = spawnFor(i)
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
