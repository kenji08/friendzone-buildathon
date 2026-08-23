import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { room } from '../shared/messages'
import { SharedState, SyncId, protectSharedState } from '../shared/schemas'

const STORAGE_KEY = 'shared_total'
const SAVE_INTERVAL = 15 // 秒。Storageは「チェックポイントで書く」もので、毎フレーム書くものではない

let stateEntity = engine.addEntity()
let dirty = false
let sinceLastSave = 0

export async function initServer() {
  stateEntity = engine.addEntity()
  Transform.create(stateEntity, { position: Vector3.create(0, 0, 0) })

  // 前回の値を復元してから同期を開始する
  const restored = await loadTotal()
  SharedState.create(stateEntity, { total: restored, updatedAt: Date.now() })

  syncEntity(stateEntity, [SharedState.componentId], SyncId.SHARED_STATE)
  protectSharedState()

  room.onMessage('contribute', (_data, context) => {
    if (!context) return // クライアント側で発火した場合は無視
    addContribution(context.from)
  })

  engine.addSystem(saveSystem)

  room.send('serverReady', { startedAt: Date.now() })
  console.log('[SERVER] ready. restored total =', restored)
}

function addContribution(from: string) {
  const state = SharedState.getMutableOrNull(stateEntity)
  if (!state) return

  state.total += 1
  state.updatedAt = Date.now()
  dirty = true

  console.log('[SERVER] contribution from', from, '-> total', state.total)
  room.send('contributed', { total: state.total })
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
    console.error('[SERVER] failed to read storage:', e)
    return 0
  }
}

async function saveTotal() {
  const state = SharedState.getOrNull(stateEntity)
  if (!state) return

  // set() は例外を投げず false を返す。戻り値を捨てると保存漏れが無言で起きる
  const ok = await Storage.set(STORAGE_KEY, String(state.total))
  if (!ok) {
    console.error('[SERVER] storage write failed — will retry')
    dirty = true
    return
  }
  console.log('[SERVER] saved total =', state.total)
}
