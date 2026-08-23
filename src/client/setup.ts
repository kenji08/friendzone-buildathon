import {
  ColliderLayer,
  engine,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  PointerEventType,
  PointerEvents,
  Transform,
  inputSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../shared/messages'
import { HEARTBEAT_TIMEOUT, SharedState } from '../shared/schemas'

let elapsed = 0
let lastBeat = 0
let lastBeatSeenAt = 0
let serverOnline = false
let total = 0

export function initClient() {
  console.log('[CLIENT] starting…')

  room.onMessage('contributed', (data) => {
    console.log('[CLIENT] total is now', data.total)
  })

  const button = engine.addEntity()
  Transform.create(button, { position: Vector3.create(8, 1, 8), scale: Vector3.create(1, 1, 1) })
  MeshRenderer.setBox(button)
  MeshCollider.setBox(button, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(button, { albedoColor: Color4.create(1, 0.6, 0.2, 1) })
  PointerEvents.create(button, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Tap' }
      }
    ]
  })

  engine.addSystem((dt: number) => {
    elapsed += dt
    trackServer()

    if (!serverOnline || !isStateSyncronized()) return

    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, button)) {
      room.send('contribute', {})
    }
  })
}

/**
 * サーバーの生存はハートビートで判断する。
 * isStateSyncronized() は「通信が繋がったか」しか分からず、
 * サーバーが動いているかは分からないため。
 */
function trackServer() {
  for (const [, state] of engine.getEntitiesWith(SharedState)) {
    total = state.total
    if (state.heartbeat !== lastBeat) {
      lastBeat = state.heartbeat
      lastBeatSeenAt = elapsed
    }
    break
  }
  serverOnline = lastBeat !== 0 && elapsed - lastBeatSeenAt < HEARTBEAT_TIMEOUT
}

export function isReady(): boolean {
  return serverOnline
}

export function getTotal(): number {
  return total
}
