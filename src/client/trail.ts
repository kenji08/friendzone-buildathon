import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  MAX_CARRIED,
  TRAIL_LAG,
  TRAIL_SAMPLE_INTERVAL,
  TRAIL_SPACING_DISTANCE,
  TRAIL_START_DISTANCE,
  TRAIL_START_LAG
} from '../shared/config'

/**
 * マリオカートのアイテムのように、持っているものを列にして後ろに従わせる。
 *
 * AvatarAttach はアバターの骨に「瞬間的に」追従する仕組みで、遅れて付いてくる
 * 動きは作れない。そこで各プレイヤーの位置を自前で記録し続け、
 * 少し前の位置を順に割り当てることで、蛇のように連なる動きを作る。
 *
 * ただし履歴を追うだけだと、止まった時に全部が同じ座標へ重なる。
 * そのため、動いていない間は向きを基準にした隊列へ滑らかに切り替える。
 */

type Pose = { position: Vector3; rotation: Quaternion }

const histories = new Map<string, Vector3[]>()
const poses = new Map<string, Pose>()
let sinceLastSample = 0

const START_SAMPLES = Math.max(1, Math.round(TRAIL_START_LAG / TRAIL_SAMPLE_INTERVAL))
const SAMPLES_PER_ORB = Math.max(1, Math.round(TRAIL_LAG / TRAIL_SAMPLE_INTERVAL))
const MAX_SAMPLES = START_SAMPLES + SAMPLES_PER_ORB * (MAX_CARRIED + 2)

/** 球を浮かせる高さ */
const CARRY_HEIGHT = 1.2

export function sampleSystem(dt: number) {
  const seen = new Set<string>()

  // 向きは毎フレーム見る。止まっている時の隊列がすぐ追従するように
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const transform = Transform.getOrNull(entity)
    if (!transform) continue

    const address = identity.address.toLowerCase()
    seen.add(address)
    poses.set(address, {
      position: Vector3.create(transform.position.x, transform.position.y, transform.position.z),
      rotation: Quaternion.create(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w
      )
    })
  }

  // 離脱したプレイヤーの記録を捨てる。放置するとメモリが増え続ける
  for (const address of histories.keys()) {
    if (!seen.has(address)) histories.delete(address)
  }
  for (const address of poses.keys()) {
    if (!seen.has(address)) poses.delete(address)
  }

  sinceLastSample += dt
  if (sinceLastSample < TRAIL_SAMPLE_INTERVAL) return
  sinceLastSample = 0

  for (const address of seen) {
    const pose = poses.get(address)
    if (!pose) continue

    let history = histories.get(address)
    if (!history) {
      history = []
      histories.set(address, history)
    }

    history.unshift(Vector3.create(pose.position.x, pose.position.y, pose.position.z))
    if (history.length > MAX_SAMPLES) history.length = MAX_SAMPLES
  }
}

/**
 * 列の rank 番目（0が先頭）に来る位置を返す。
 *
 * 移動していれば通った軌跡を、止まっていれば背後の隊列を使う。
 * 二つを距離で混ぜているので、歩き出しと停止で見た目が飛ばない。
 */
export function trailPosition(address: string, rank: number): Vector3 | null {
  const key = address.toLowerCase()
  const pose = poses.get(key)
  if (!pose) return null

  const wantedDistance = TRAIL_START_DISTANCE + rank * TRAIL_SPACING_DISTANCE
  const formation = behindPosition(pose, wantedDistance)

  const history = histories.get(key)
  if (!history || history.length === 0) return withHeight(formation, pose.position.y)

  const index = Math.min(START_SAMPLES + rank * SAMPLES_PER_ORB, history.length - 1)
  const trailed = history[index]

  // 履歴上の点がどれだけ離れているかで、軌跡と隊列の比率を決める。
  // 止まっているほど 0 に近づき、隊列側が使われる。
  const travelled = Vector3.distance(pose.position, trailed)
  const blend = Math.max(0, Math.min(1, travelled / wantedDistance))

  const mixed = Vector3.lerp(formation, trailed, blend)
  return withHeight(mixed, mixed.y)
}

function behindPosition(pose: Pose, distance: number): Vector3 {
  const backward = Vector3.rotate(Vector3.create(0, 0, -1), pose.rotation)
  return Vector3.create(
    pose.position.x + backward.x * distance,
    pose.position.y,
    pose.position.z + backward.z * distance
  )
}

function withHeight(position: Vector3, baseY: number): Vector3 {
  return Vector3.create(position.x, baseY + CARRY_HEIGHT, position.z)
}

export function attachTrail(entity: Entity, position: Vector3) {
  const transform = Transform.getMutableOrNull(entity)
  if (!transform) return
  transform.position = position
}
