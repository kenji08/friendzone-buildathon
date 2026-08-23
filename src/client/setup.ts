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

/** サーバーの起動完了を受け取るまで操作を受け付けない */
let serverReady = false
let synced = false

export function initClient() {
  room.onMessage('serverReady', () => {
    serverReady = true
    console.log('[CLIENT] server is ready')
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
        eventInfo: { button: InputAction.IA_POINTER, hoverText: 'タップ' }
      }
    ]
  })

  engine.addSystem(() => {
    synced = isStateSyncronized()
    if (!synced || !serverReady) return
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, button)) {
      room.send('contribute', {})
    }
  })
}

export function isReady(): boolean {
  return synced && serverReady
}
