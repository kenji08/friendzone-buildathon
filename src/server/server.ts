import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import { HEARTBEAT_INTERVAL, SharedState, SyncId, protectSharedState } from '../shared/schemas'

const STORAGE_KEY = 'shared_total'
const SAVE_INTERVAL = 15 // 秒。Storageはチェックポイントで書くもので、毎フレーム書くものではない

let stateEntity = engine.addEntity()
let dirty = false
let sinceLastSave = 0
let sinceLastBeat = 0

/**
 * 同期とメッセージ受付を「同期的に」立ち上げてから、保存データの復元を後追いで行う。
 * Storage の await を初期化の手前に置くと、それが返るまでシーンが無反応になる。
 */
export function initServer() {
  console.log('[SERVER] starting…')

  stateEntity = engine.addEntity()
  Transform.create(stateEntity, { position: Vector3.create(0, 0, 0) })
  SharedState.create(stateEntity, { total: 0, heartbeat: Date.now() })

  syncEntity(stateEntity, [SharedState.componentId], SyncId.SHARED_STATE)
  protectSharedState()

  room.onMessage('contribute', (_data, context) => {
    if (!context) return // サーバー側で受け取ったものだけ扱う
    addContribution(context.from)
  })

  engine.addSystem(heartbeatSystem)
  engine.addSystem(saveSystem)

  console.log('[SERVER] ready')

  // 復元は後追い。失敗しても以降の動作は止めない
  void restore()
}

async function restore() {
  const restored = await loadTotal()
  if (restored <= 0) return

  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return
  state.total = restored
  console.log('[SERVER] restored total =', restored)
}

function addContribution(from: string) {
  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return

  state.total += 1
  dirty = true

  console.log('[SERVER] contribution from', from, '-> total', state.total)
  room.send('contributed', { total: state.total })
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
  void saveTotal()
}

async function loadTotal(): Promise<number> {
  try {
    const raw = await Storage.get<string>(STORAGE_KEY)
    const parsed = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch (e) {
    console.log('[SERVER] failed to read storage:', e)
    return 0
  }
}

async function saveTotal() {
  const state = SharedState.getOrNull(stateEntity)
  if (!state) return

  // set() は例外を投げず false を返す。戻り値を捨てると保存漏れが無言で起きる
  const ok = await Storage.set(STORAGE_KEY, String(state.total))
  if (!ok) {
    console.log('[SERVER] storage write failed — will retry')
    dirty = true
    return
  }
  console.log('[SERVER] saved total =', state.total)
}
