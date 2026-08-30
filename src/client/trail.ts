import { Entity, PlayerIdentityData, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { TRAIL_LAG, TRAIL_SAMPLE_INTERVAL } from '../shared/config'

/**
 * マリオカートのアイテムのように、持っているものを列にして後ろに従わせる。
 *
 * AvatarAttach はアバターの骨に「瞬間的に」追従する仕組みで、遅れて付いてくる
 * 動きは作れない。そこで各プレイヤーの位置を自前で記録し続け、
 * 少し前の位置を順に割り当てることで、蛇のように連なる動きを作る。
 */

type History = Vector3[]

const histories = new Map<string, History>()
let sinceLastSample = 0

/** 何サンプル分さかのぼれば1個分の遅れになるか */
const SAMPLES_PER_ORB = Math.max(1, Math.round(TRAIL_LAG / TRAIL_SAMPLE_INTERVAL))

/** 履歴として保持する上限。持てる数に余裕を持たせた長さ */
const MAX_SAMPLES = SAMPLES_PER_ORB * 12

export function sampleSystem(dt: number) {
  sinceLastSample += dt
  if (sinceLastSample < TRAIL_SAMPLE_INTERVAL) return
  sinceLastSample = 0

  const seen = new Set<string>()

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const transform = Transform.getOrNull(entity)
    if (!transform) continue

    const address = identity.address.toLowerCase()
    seen.add(address)

    let history = histories.get(address)
    if (!history) {
      history = []
      histories.set(address, history)
    }

    history.unshift(Vector3.create(transform.position.x, transform.position.y, transform.position.z))
    if (history.length > MAX_SAMPLES) history.length = MAX_SAMPLES
  }

  // 離脱したプレイヤーの履歴を捨てる。放置するとメモリが増え続ける
  for (const address of histories.keys()) {
    if (!seen.has(address)) histories.delete(address)
  }
}

/**
 * 列の position 番目（0が先頭）に来る位置を返す。
 * 履歴がまだ足りない場合は、持っている中で一番古い位置を返す。
 */
export function trailPosition(address: string, position: number): Vector3 | null {
  const history = histories.get(address.toLowerCase())
  if (!history || history.length === 0) return null

  const index = Math.min((position + 1) * SAMPLES_PER_ORB, history.length - 1)
  const sample = history[index]
  return Vector3.create(sample.x, sample.y + 1.2, sample.z)
}

/** 追従用の見た目をプレイヤーの現在地に置きたい時に使う（履歴が無い時の保険） */
export function currentPosition(address: string): Vector3 | null {
  return trailPosition(address, -1)
}

export function attachTrail(entity: Entity, position: Vector3) {
  const transform = Transform.getMutableOrNull(entity)
  if (!transform) return
  transform.position = position
}
