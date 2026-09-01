import { Entity, Material, MeshRenderer, Transform, engine } from '@dcl/sdk/ecs'
import { Color3, Color4, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/src/players'
import { GLOW_RANGE, PICKUP_RADIUS } from '../shared/config'
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

/**
 * 取得を要求済みの球。
 * サーバーの受信には毎秒あたりの上限があるので、
 * 同じ球に対して毎フレーム送らないよう記録しておく。
 */
const requested = new Set<number>()

let selfAddress = ''

export function initOrbs() {
  const player = getPlayer()
  if (player) selfAddress = player.userId.toLowerCase()

  engine.addSystem(orbVisualSystem)
}

/** サーバーから届いた球それぞれに、見た目を用意する */
function ensureVisual(index: number): Entity {
  const existing = visuals.get(index)
  if (existing) return existing

  const visual = engine.addEntity()
  Transform.create(visual, { scale: Vector3.create(0.7, 0.7, 0.7) })
  MeshRenderer.setSphere(visual)
  Material.setPbrMaterial(visual, {
    albedoColor: Color4.create(1, 0.75, 0.2, 1),
    emissiveColor: Color3.create(1, 0.6, 0.1),
    emissiveIntensity: 0.2
  })

  visuals.set(index, visual)
  return visual
}

/**
 * 落ちている球は同期された座標に置く。
 * 持たれている球は、持ち主の少し前の位置を追わせる（列になる）。
 *
 * あわせて、近くに来た球の取得をサーバーへ要求する。
 * 小さな的をタップさせるより、歩いて触れる方がスマホでは扱いやすい。
 */
function orbVisualSystem() {
  const selfPos = Transform.getOrNull(engine.PlayerEntity)?.position
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

      // 手放されたら、また要求できるようにする
      requested.delete(orb.index)

      if (canPick && selfPos && worldPos && Vector3.distance(selfPos, worldPos) <= PICKUP_RADIUS) {
        if (!requested.has(orb.index)) {
          requested.add(orb.index)
          room.send('pickup', { index: orb.index })
        }
      }
      continue
    }

    const carrier = orb.carrier.toLowerCase()
    const rank = carriedRank.get(carrier) ?? 0
    carriedRank.set(carrier, rank + 1)

    const trail = trailPosition(carrier, rank)
    if (trail) visualTransform.position = trail

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

function setEmissive(visual: Entity, intensity: number) {
  const previous = lastEmissive.get(visual)
  if (previous !== undefined && Math.abs(previous - intensity) < 0.05) return

  const material = Material.getMutableOrNull(visual)
  if (!material || material.material?.$case !== 'pbr') return
  material.material.pbr.emissiveIntensity = intensity
  lastEmissive.set(visual, intensity)
}

export function carriedByMe(): number {
  if (selfAddress === '') return 0
  let count = 0
  for (const [, orb] of engine.getEntitiesWith(Orb)) {
    if (orb.carrier.toLowerCase() === selfAddress) count++
  }
  return count
}
