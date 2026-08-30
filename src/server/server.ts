import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import {
  CARRY_DURATION,
  MAX_CARRIED,
  ORB_COUNT,
  ORB_SPAWNS,
  PICKUP_RANGE
} from '../shared/config'
import { room } from '../shared/messages'
import { HEARTBEAT_INTERVAL, Orb, SharedState, SyncId, protectState } from '../shared/schemas'

const STORAGE_KEY = 'rounds'
const SAVE_INTERVAL = 15

let stateEntity = engine.addEntity()
const orbs: Entity[] = []

let sinceLastBeat = 0
let sinceLastSave = 0
let sinceLastCarryCheck = 0
let dirty = false

/** 落下判定を回す間隔（秒）。毎フレーム回す必要のない処理 */
const CARRY_CHECK_INTERVAL = 0.25

/**
 * 同期とメッセージ受付を同期的に立ち上げてから、保存データの復元を後追いで行う。
 * Storage の await を初期化の手前に置くと、それが返るまでシーンが無反応になる。
 */
export function initServer() {
  console.log('[SERVER] starting…')

  stateEntity = engine.addEntity()
  Transform.create(stateEntity, { position: Vector3.create(0, 0, 0) })
  SharedState.create(stateEntity, { heartbeat: Date.now(), rounds: 0 })
  syncEntity(stateEntity, [SharedState.componentId], SyncId.SHARED_STATE)

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

  engine.addSystem(heartbeatSystem)
  engine.addSystem(carryTimerSystem)
  engine.addSystem(saveSystem)

  console.log('[SERVER] ready with', ORB_COUNT, 'orbs')

  void restore()
}

function spawnFor(index: number): Vector3 {
  const p = ORB_SPAWNS[index % ORB_SPAWNS.length]
  return Vector3.create(p.x, p.y, p.z)
}

/** クライアントは位置を偽装できるので、拾えるかどうかはサーバー側の座標で判定する */
function tryPickup(index: number, from: string) {
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
      if (transform) {
        transform.position = Vector3.create(dropAt.x, dropAt.y + 0.6, dropAt.z)
      }
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

/** クライアントがサーバーの生存を判断するための鼓動 */
function heartbeatSystem(dt: number) {
  sinceLastBeat += dt
  if (sinceLastBeat < HEARTBEAT_INTERVAL) return
  sinceLastBeat = 0

  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return
  state.heartbeat = Date.now()
}

function saveSystem(dt: number) {
  if (!dirty) return
  sinceLastSave += dt
  if (sinceLastSave < SAVE_INTERVAL) return
  sinceLastSave = 0
  dirty = false
  void saveRounds()
}

async function restore() {
  try {
    const raw = await Storage.get<string>(STORAGE_KEY)
    const parsed = raw ? parseInt(raw, 10) : 0
    if (!Number.isFinite(parsed) || parsed <= 0) return

    const state = SharedState.getMutableOrNull(stateEntity)
    if (!state) return
    state.rounds = parsed
    console.log('[SERVER] restored rounds =', parsed)
  } catch (e) {
    console.log('[SERVER] failed to read storage:', e)
  }
}

async function saveRounds() {
  const state = SharedState.getOrNull(stateEntity)
  if (!state) return

  // set() は例外を投げず false を返す。戻り値を捨てると保存漏れが無言で起きる
  const ok = await Storage.set(STORAGE_KEY, String(state.rounds))
  if (!ok) {
    console.log('[SERVER] storage write failed — will retry')
    dirty = true
    return
  }
  console.log('[SERVER] saved rounds =', state.rounds)
}
