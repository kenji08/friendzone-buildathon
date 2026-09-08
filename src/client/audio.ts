import { AudioSource, Entity, Transform, engine } from '@dcl/sdk/ecs'

/**
 * 音は各プレイヤーのローカルで鳴る。近くの他プレイヤーには自動では聞こえないので、
 * 「自分が拾った音」は自分にだけ届く。
 *
 * 音源はプレイヤーに追従させる。エンティティの位置から聞こえる仕組みなので、
 * 地面に固定すると離れた時に減衰してしまう。
 */

const PICKUP_SOUND = 'assets/audio/get.mp3'
const WIN_SOUND = 'assets/audio/win.mp3'
const COUNTDOWN_SOUND = 'assets/audio/Countdown06-1.mp3'

let pickupSource: Entity
let winSource: Entity
let countdownSource: Entity

export function initAudio() {
  pickupSource = engine.addEntity()
  Transform.create(pickupSource, { parent: engine.PlayerEntity })

  winSource = engine.addEntity()
  Transform.create(winSource, { parent: engine.PlayerEntity })

  countdownSource = engine.addEntity()
  Transform.create(countdownSource, { parent: engine.PlayerEntity })
}

/** 球を拾った時。同じ音が続くので、わずかに音程を変えて単調さを避ける */
export function playPickup() {
  if (!pickupSource) return

  const source = AudioSource.getMutableOrNull(pickupSource)
  if (source) source.pitch = 0.94 + Math.random() * 0.12

  AudioSource.playSound(pickupSource, PICKUP_SOUND, true)
}

export function playWin() {
  if (!winSource) return
  AudioSource.playSound(winSource, WIN_SOUND, true)
}

/** 開始のカウントダウン。音源が4秒なので、開始の4秒前から鳴らす */
export function playCountdown() {
  if (!countdownSource) return
  AudioSource.playSound(countdownSource, COUNTDOWN_SOUND, true)
}
