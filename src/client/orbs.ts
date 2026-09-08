import { Entity, GltfContainer, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
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
  engine.addSystem(spinSystem)
}

/** サーバーから届いた音符それぞれに、見た目を用意する */
function ensureVisual(index: number): Entity {
  const existing = visuals.get(index)
  if (existing) return existing

  const visual = engine.addEntity()
  Transform.create(visual, { scale: Vector3.create(1, 1, 1) })
  GltfContainer.create(visual, { src: 'assets/models/note.glb' })

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
      setLiveliness(visual, selfPos, worldPos)

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

    // 持たれている間は常に速く回す
    nearness.set(visual, 1)
  }
}

/**
 * 近づくほど速く回す。
 *
 * 取り込んだモデルのマテリアルはコードから変えられないため、
 * 光の強さでは距離を表せない。代わりに回転の速さと上下の揺れで示す。
 */
function setLiveliness(visual: Entity, from: Vector3 | undefined, to: Vector3 | undefined) {
  if (!from || !to) return
  const distance = Vector3.distance(from, to)
  const closeness = Math.max(0, Math.min(1, 1 - distance / GLOW_RANGE))
  nearness.set(visual, closeness)
}

/** 各音符が今どれだけ近いか。回転の速さに使う */
const nearness = new Map<Entity, number>()

let spin = 0

function spinSystem(dt: number) {
  spin += dt

  for (const [, visual] of visuals) {
    const transform = Transform.getMutableOrNull(visual)
    if (!transform) continue

    const closeness = nearness.get(visual) ?? 0
    const speed = 0.6 + closeness * 2.4
    transform.rotation = Quaternion.fromEulerDegrees(0, (spin * speed * 90) % 360, 0)
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
