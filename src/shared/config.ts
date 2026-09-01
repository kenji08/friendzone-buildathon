/**
 * 触りながら調整する数字。ここだけ見れば全部変えられるようにまとめてある。
 */

/**
 * 世界に置く球の総数。
 *
 * 時間で手放す仕組みが無いので、全員が「あと1個」で止まったまま
 * 球が枯れると誰も勝てなくなる。上限人数が3個ずつ抱えても
 * なお1個余る数にしておく（6人 x 3個 + 1）。
 */
export const ORB_COUNT = 20

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

/** 最初の参加者が出てから、ラウンドが始まるまでの猶予（秒）。他の人が入る余地 */
export const JOIN_WINDOW = 20

/** 結果表示を出しておく秒数 */
export const RESULT_DURATION = 6

/** 1ラウンドに参加できる人数の上限 */
export const MAX_PARTICIPANTS = 6

/** リーダーボードに表示する人数 */
export const LEADERBOARD_SIZE = 5

/** 保存しておく人数。表示より多めに持っておく */
export const LEADERBOARD_KEEP = 20

/**
 * 近づいたら取得する距離（メートル）。
 * 小さな的をタップさせるより、歩いて触れる方がスマホでは扱いやすい。
 * 広げすぎると立っているだけで集まってしまう。
 */
export const PICKUP_RADIUS = 1.5

/** 同時に持てる数 */
export const MAX_CARRIED = 4

/**
 * サーバーが拾得を認める距離（メートル）。
 * 自動取得の距離より広めに取り、通信の遅れによる座標のずれを吸収する。
 */
export const PICKUP_RANGE = 4

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

/** 球を置く範囲。シーンの端に寄りすぎないよう内側に取る */
export const SPAWN_AREA = { min: 3, max: 29 }

/** 球を地面からどれだけ浮かせるか（メートル） */
export const ORB_HEIGHT = 0.6

/** 球どうしを離す最小距離。固まって湧くと探す面白さが消える */
export const MIN_ORB_SEPARATION = 3.5
