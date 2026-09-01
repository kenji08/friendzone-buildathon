import { Vector3 } from '@dcl/sdk/math'
import { MIN_ORB_SEPARATION, ORB_HEIGHT, SPAWN_AREA } from './config'
import { groundHeightAt } from './terrain-heights'

/**
 * ラウンドごとの球の配置を決める。
 *
 * 地面の高さは表から引くので、サーバーとクライアントで値が食い違わない。
 * サーバーだけがこれを呼び、結果を同期する。
 */
export function pickSpawns(count: number): Vector3[] {
  const chosen: Vector3[] = []
  const span = SPAWN_AREA.max - SPAWN_AREA.min

  // 距離を空けて置きたいが、詰まると無限に粘ってしまうので試行回数で打ち切る
  let attempts = 0
  const maxAttempts = count * 60

  while (chosen.length < count && attempts < maxAttempts) {
    attempts++

    const x = SPAWN_AREA.min + Math.random() * span
    const z = SPAWN_AREA.min + Math.random() * span

    if (tooClose(chosen, x, z)) continue

    chosen.push(Vector3.create(x, groundHeightAt(x, z) + ORB_HEIGHT, z))
  }

  // 間隔を守れなかった分は、条件を緩めて埋める
  while (chosen.length < count) {
    const x = SPAWN_AREA.min + Math.random() * span
    const z = SPAWN_AREA.min + Math.random() * span
    chosen.push(Vector3.create(x, groundHeightAt(x, z) + ORB_HEIGHT, z))
  }

  return chosen
}

function tooClose(chosen: Vector3[], x: number, z: number): boolean {
  for (const p of chosen) {
    const dx = p.x - x
    const dz = p.z - z
    if (dx * dx + dz * dz < MIN_ORB_SEPARATION * MIN_ORB_SEPARATION) return true
  }
  return false
}

/** 落とした地点を地面の上に乗せる */
export function onGround(x: number, z: number): Vector3 {
  return Vector3.create(x, groundHeightAt(x, z) + ORB_HEIGHT, z)
}
