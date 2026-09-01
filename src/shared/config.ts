import { Vector3 } from '@dcl/sdk/math'

/**
 * 触りながら調整する数字。ここだけ見れば全部変えられるようにまとめてある。
 */

/** 世界に置く球の総数 */
export const ORB_COUNT = 11

/**
 * 決着に必要な数。
 * Phase 2 で「6個が一箇所に近づいたら決着」に差し替える予定の値。
 */
export const ORBS_TO_WIN = 6

/**
 * Phase 1 の暫定ルール。1人がこの数を同時に持てば勝ち。
 * 複数人のルールへ移る時に、この判定ごと置き換える。
 */
export const CARRY_TO_WIN = 4

/** 勝利表示を出しておく秒数 */
export const WIN_BANNER_DURATION = 4

/** 決着から次のラウンドが始まるまでの秒数 */
export const INTERMISSION_DURATION = 60

/** リーダーボードに表示する人数 */
export const LEADERBOARD_SIZE = 5

/** 保存しておく人数。表示より多めに持っておく */
export const LEADERBOARD_KEEP = 20

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

/** 球の初期配置 */
export const ORB_SPAWNS: Vector3[] = [
  // 地形ができるまでは全部を地面の高さに置く。
  // 段ができたら、その段の高さに合わせて置き直す。
  Vector3.create(5, 0.5, 6),
  Vector3.create(26, 0.5, 7),
  Vector3.create(9, 0.5, 25),
  Vector3.create(27, 0.5, 26),
  Vector3.create(16, 0.5, 5),
  Vector3.create(5, 0.5, 16),
  Vector3.create(28, 0.5, 16),
  Vector3.create(16, 0.5, 28),
  Vector3.create(10, 0.5, 11),
  Vector3.create(23, 0.5, 12),
  Vector3.create(12, 0.5, 21)
]
