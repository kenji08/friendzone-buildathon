import { Vector3 } from '@dcl/sdk/math'

/**
 * 触りながら調整する数字。ここだけ見れば全部変えられるようにまとめてある。
 */

/** 世界に置く球の総数 */
export const ORB_COUNT = 11

/** 決着に必要な数 */
export const ORBS_TO_WIN = 6

/** 拾ってから手を離れるまでの秒数 */
export const CARRY_DURATION = 12

/** 同時に持てる数 */
export const MAX_CARRIED = 4

/** 拾える距離（メートル） */
export const PICKUP_RANGE = 4

/** 追従する球どうしの間隔（秒）。1個目は0.25秒前、2個目は0.5秒前の位置を追う */
export const TRAIL_LAG = 0.25

/** 位置履歴を取る間隔（秒） */
export const TRAIL_SAMPLE_INTERVAL = 0.05

/** 球が光り始める距離。これより近いと明るくなる */
export const GLOW_RANGE = 12

/**
 * 球の初期配置。段のあるシーンを想定して3層に散らしてある。
 * 地形ができたら、それに合わせて置き直す。
 */
export const ORB_SPAWNS: Vector3[] = [
  // 1層目（地面）
  Vector3.create(6, 0.6, 7),
  Vector3.create(25, 0.6, 9),
  Vector3.create(11, 0.6, 26),
  Vector3.create(27, 0.6, 24),
  // 2層目
  Vector3.create(9, 4.6, 15),
  Vector3.create(22, 4.6, 6),
  Vector3.create(17, 4.6, 28),
  Vector3.create(29, 4.6, 17),
  // 3層目
  Vector3.create(13, 8.6, 11),
  Vector3.create(24, 8.6, 20),
  Vector3.create(6, 8.6, 21)
]
