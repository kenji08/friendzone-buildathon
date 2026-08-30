import { Vector3 } from '@dcl/sdk/math'

/**
 * 触りながら調整する数字。ここだけ見れば全部変えられるようにまとめてある。
 */

/** 世界に置く球の総数 */
export const ORB_COUNT = 11

/** 決着に必要な数 */
export const ORBS_TO_WIN = 6

/** 拾ってから手を離れるまでの秒数 */
export const CARRY_DURATION = 30

/** 同時に持てる数 */
export const MAX_CARRIED = 4

/** 拾える距離（メートル） */
export const PICKUP_RANGE = 8

/**
 * 1個目の球が追う位置の遅れ（秒）。
 * 小さすぎるとアバターの体に重なって見えなくなる。
 */
export const TRAIL_START_LAG = 0.5

/** 球どうしの間隔（秒）。2個目以降はこの分だけ後ろにずれる */
export const TRAIL_LAG = 0.3

/** 位置履歴を取る間隔（秒） */
export const TRAIL_SAMPLE_INTERVAL = 0.05

/**
 * 止まっている時に背後へ並ぶ距離（メートル）。
 * 履歴を追う方式は、止まると全部が同じ座標に重なってしまうため、
 * 動いていない間はこちらの隊列に切り替える。
 */
export const TRAIL_START_DISTANCE = 1.3

/** 止まっている時の球どうしの間隔（メートル） */
export const TRAIL_SPACING_DISTANCE = 0.9

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
