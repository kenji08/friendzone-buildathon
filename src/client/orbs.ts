import {
  ColliderLayer,
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  PointerEventType,
  PointerEvents,
  Transform,
  engine,
  inputSystem
} from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/src/players'
import { GLOW_RANGE, PICKUP_RANGE } from '../shared/config'
import { room } from '../shared/messages'
import { Orb } from '../shared/schemas'
import { amParticipating, isPlaying } from './setup'
import { trailPosition } from './trail'

/**
 * 球の見た目はクライアント側で作る。サーバーが持っているのは
 * 「どこにあるか」と「誰が持っているか」だけ。
 *
 * 形は今は組み込みの球で仮置きしている。モデルができたら
 * MeshRenderer を GLTFContainer に差し替えるだけで入れ替わる。
 */

/** 同期されている球（サーバー製）に対して、こちらで足した見た目の対応表 */
const visuals = new Map<number, Entity>()

let selfAddress = ''

export function initOrbs() {
  const player = getPlayer()
  if (player) selfAddress = player.userId.toLowerCase()

  engine.addSystem(orbVisualSystem)
  engine.addSystem(pickupSystem)
}

/** サーバーから届いた球それぞれに、見た目と当たり判定を用意する */
function ensureVisual(index: number): Entity {
  const existing = visuals.get(index)
  if (existing) return existing

  const visual = engine.addEntity()
  Transform.create(visual, { scale: Vector3.create(0.7, 0.7, 0.7) })
  MeshRenderer.setSphere(visual)
  MeshCollider.setSphere(visual, ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(visual, {
    albedoColor: Color4.create(1, 0.75, 0.2, 1),
    emissiveColor: Color3.create(1, 0.6, 0.1),
    emissiveIntensity: 0.2
  })
  PointerEvents.create(visual, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: {
          button: InputAction.IA_POINTER,
          hoverText: 'Take',
          maxDistance: PICKUP_RANGE
        }
      }
    ]
  })

  visuals.set(index, visual)
  return visual
}

/**
 * 落ちている球は同期された座標に置く。
 * 持たれている球は、持ち主の少し前の位置を追わせる（列になる）。
 */
function orbVisualSystem() {
  const selfPos = Transform.getOrNull(engine.PlayerEntity)?.position
  // 観戦者とラウンド外では触れない。サーバー側でも弾いているが、
  // 触れるように見えるとタップの空振りが起きる
  const canPick = isPlaying() && amParticipating()

  // 持ち主ごとに何個目かを数えるための作業用
  const carriedRank = new Map<string, number>()

  for (const [entity, orb] of engine.getEntitiesWith(Orb)) {
    const visual = ensureVisual(orb.index)
    const visualTransform = Transform.getMutableOrNull(visual)
    if (!visualTransform) continue

    if (orb.carrier === '') {
      const worldPos = Transform.getOrNull(entity)?.position
      if (worldPos) visualTransform.position = worldPos
      setGlow(visual, selfPos, worldPos)
            setPickable(visual, canPick)
      continue
    }

    const carrier = orb.carrier.toLowerCase()
    const rank = carriedRank.get(carrier) ?? 0
    carriedRank.set(carrier, rank + 1)

    const trail = trailPosition(carrier, rank)
    if (trail) visualTransform.position = trail

    // 持たれている間は拾えない
    setPickable(visual, false)
    setEmissive(visual, 0.9)
  }
}

/** 近づくほど強く光らせる。探すことを視点操作ではなく移動で成立させるため */
function setGlow(visual: Entity, from: Vector3 | undefined, to: Vector3 | undefined) {
  if (!from || !to) return
  const distance = Vector3.distance(from, to)
  const closeness = Math.max(0, Math.min(1, 1 - distance / GLOW_RANGE))
  setEmissive(visual, 0.15 + closeness * closeness * 1.6)
}

/** 直前に書き込んだ値。差がない時は書き込まない（毎フレームの無駄を避ける） */
const lastEmissive = new Map<Entity, number>()
const lastPickable = new Map<Entity, boolean>()

function setEmissive(visual: Entity, intensity: number) {
  const previous = lastEmissive.get(visual)
  if (previous !== undefined && Math.abs(previous - intensity) < 0.05) return

  const material = Material.getMutableOrNull(visual)
  if (!material || material.material?.$case !== 'pbr') return
  material.material.pbr.emissiveIntensity = intensity
  lastEmissive.set(visual, intensity)
}

function setPickable(visual: Entity, pickable: boolean) {
  if (lastPickable.get(visual) === pickable) return

  const events = PointerEvents.getMutableOrNull(visual)
  if (!events) return
  const info = events.pointerEvents[0]?.eventInfo
  if (!info) return
  info.maxDistance = pickable ? PICKUP_RANGE : 0
  lastPickable.set(visual, pickable)
}

/** タップされたらサーバーに要求を出すだけ。拾えるかどうかはサーバーが決める */
function pickupSystem() {
  for (const [index, visual] of visuals) {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, visual)) {
      room.send('pickup', { index })
    }
  }
}

export function carriedByMe(): number {
  if (selfAddress === '') return 0
  let count = 0
  for (const [, orb] of engine.getEntitiesWith(Orb)) {
    if (orb.carrier.toLowerCase() === selfAddress) count++
  }
  return count
}
