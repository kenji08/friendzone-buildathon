import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { CARRY_TO_WIN, MAX_PARTICIPANTS } from '../shared/config'
import { LeaderboardEntry, Participant } from '../shared/schemas'
import { carriedByMe } from './orbs'
import {
  amParticipating,
  getLeaderboard,
  getRoster,
  getRounds,
  didIWin,
  getWinnerName,
  isPlaying,
  isReady,
  isResult,
  isStarting,
  isWaiting,
  joinRejection,
  joinRound,
  leaveRound,
  secondsToNextRound,
  showingWin
} from './setup'

/**
 * Mobile reserves the left edge (joystick) and the bottom-right corner
 * (interact button, chat, profile). Custom UI stays at the top, with the
 * one tappable control at the bottom centre.
 *
 * Containers carry explicit dimensions: an auto-sized parent can collapse
 * when its content changes, which made the readout vanish.
 */
export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
    {statusBar()}
    {leaderboard()}
    {roster()}
    {rules()}
    {winBanner()}
  </UiEntity>
)

function statusText(): string {
  if (!isReady()) return 'Waking up…'
  if (isWaiting()) return 'Waiting for players'
  if (isStarting()) return `Starting in ${secondsToNextRound()}s`
  if (isResult()) return getWinnerName() ? `${getWinnerName()} wins` : 'Round over'
  if (!amParticipating()) return 'Watching'
  return `${carriedByMe()} / ${CARRY_TO_WIN}`
}

/**
 * 状態表示と参加ボタンを縦に並べる。
 * ボタンは状態表示の真下に置き、視線の移動を減らす。
 */
const statusBar = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: '4%', left: '0%' },
      width: '100%',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'center',
      pointerFilter: 'none'
    }}
  >
    <UiEntity
      uiTransform={{ width: 560, height: 92, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <Label
        value={statusText()}
        fontSize={56}
        color={Color4.White()}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
    {joinButton()}
  </UiEntity>
)

/** 名前が未登録の相手だけ、アドレスを縮めて出す */
function displayName(entry: { address: string; name: string }): string {
  if (entry.name) return entry.name
  if (entry.address.length <= 10) return entry.address
  return `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`
}

/**
 * 右上に置く。モバイルは左端がジョイスティック、右下がボタン類なので、
 * 空いているのは上側になる。
 */
const leaderboard = () => {
  // プレイ中は画面を空けておく。順位が意味を持つのは待機中と結果表示の時
  if (isPlaying()) return null

  const entries = getLeaderboard()
  if (entries.length === 0) return null

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '4%', right: '3%' },
        width: 340,
        height: 44 + entries.length * 36,
        flexDirection: 'column',
        padding: 8
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
    >
      <Label
        value="Leaderboard"
        fontSize={22}
        color={Color4.create(1, 1, 1, 0.7)}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 30 }}
      />
      {entries.map((entry: LeaderboardEntry, i: number) => (
        <Label
          key={entry.address}
          value={`${i + 1}. ${displayName(entry)}  ${entry.wins}`}
          fontSize={28}
          color={Color4.White()}
          textAlign="middle-left"
          uiTransform={{ width: '100%', height: 34 }}
        />
      ))}
    </UiEntity>
  )
}

/** いま誰が何個持っているか。観戦者にも見せる */
const roster = () => {
  const players = getRoster()
  if (players.length === 0) return null

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '4%', left: '3%' },
        width: 320,
        height: 44 + players.length * 34,
        flexDirection: 'column',
        padding: 8
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
    >
      <Label
        value={`In this round  ${players.length}/${MAX_PARTICIPANTS}`}
        fontSize={20}
        color={Color4.create(1, 1, 1, 0.7)}
        textAlign="middle-left"
        uiTransform={{ width: '100%', height: 30 }}
      />
      {players.map((p: Participant) => (
        <Label
          key={p.address}
          value={`${displayName(p)}  ${p.carrying}`}
          fontSize={26}
          color={Color4.White()}
          textAlign="middle-left"
          uiTransform={{ width: '100%', height: 32 }}
        />
      ))}
    </UiEntity>
  )
}

/**
 * 参加する前にルールを読めるようにする。
 * 何が起きるか分からないままゲームが始まるのを避けるため、
 * 募集中は時間制限を置かず、読み終えてから参加できる。
 */
const rules = () => {
  if (amParticipating() || !(isWaiting() || isStarting())) return null

  const lines = [
    `Orbs brighten as you get close — walk into one to pick it up.`,
    `What you carry trails behind you for everyone to see.`,
    `Bump into another player and whoever holds more drops one.`,
    `Collect ${CARRY_TO_WIN} to win the round.`
  ]

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '32%', left: '0%' },
        width: '100%',
        height: 260,
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <UiEntity
        uiTransform={{ width: 720, height: 260, flexDirection: 'column', padding: 20 }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
      >
        <Label
          value="How it works"
          fontSize={34}
          color={Color4.White()}
          textAlign="middle-left"
          uiTransform={{ width: '100%', height: 50 }}
        />
        {lines.map((line: string, i: number) => (
          <Label
            key={`rule-${i}`}
            value={line}
            fontSize={24}
            color={Color4.create(1, 1, 1, 0.85)}
            textAlign="middle-left"
            uiTransform={{ width: '100%', height: 46 }}
          />
        ))}
      </UiEntity>
    </UiEntity>
  )
}

function buttonLabel(): string {
  const rejected = joinRejection()
  if (rejected !== '') return rejected
  if (amParticipating()) return 'Leave round'
  if (isPlaying()) return 'Join next round'
  return 'Join the round'
}

/**
 * 唯一のタップ操作。状態表示のすぐ下に置く。
 * 親は pointerFilter が none なので、この枠だけ block にして受け取る。
 */
const joinButton = () => {
  if (!isReady()) return null
  const playing = amParticipating()

  return (
    <UiEntity
      uiTransform={{
        width: 380,
        height: 68,
        margin: { top: 10 },
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{
        color: playing ? Color4.create(0.5, 0.1, 0.1, 0.85) : Color4.create(0.1, 0.45, 0.25, 0.9)
      }}
      onMouseDown={() => {
        if (playing) leaveRound()
        else joinRound()
      }}
    >
      <Label
        value={buttonLabel()}
        fontSize={28}
        color={Color4.White()}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
  )
}

/** 勝利画像は透過PNG。2のべき乗の寸法（1024x512）に整えてある */
/**
 * 決着の表示。勝った人には画像を、それ以外の人には誰が勝ったかを出す。
 * 負けた人にまで YOU WIN が出ていると意味が通らない。
 */
const winBanner = () => {
  if (!showingWin()) return null
  return didIWin() ? winnerBanner() : loserBanner()
}

/** 勝利画像は透過PNG。2のべき乗の寸法（1024x512）に整えてある */
const winnerBanner = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: '0%', left: '0%' },
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center'
    }}
  >
    <UiEntity
      uiTransform={{ width: '60%', height: '30%' }}
      uiBackground={{
        textureMode: 'stretch',
        texture: { src: 'assets/ui/youwin.png' }
      }}
    />
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '66%', left: '0%' },
        width: '100%',
        height: 34,
        justifyContent: 'center'
      }}
    >
      <Label
        value={`Round ${getRounds()}`}
        fontSize={22}
        color={Color4.White()}
        textAlign="middle-center"
      />
    </UiEntity>
  </UiEntity>
)

/**
 * 勝てなかった人向け。誰に負けたかが分かる方が、次に挑む理由になる。
 */
const loserBanner = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: '0%', left: '0%' },
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}
  >
    <UiEntity
      uiTransform={{ width: 720, height: 96, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
    >
      <Label
        value={`${getWinnerName().toUpperCase()} WINS`}
        fontSize={64}
        color={Color4.White()}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
    <UiEntity
      uiTransform={{ width: 720, height: 48, margin: { top: 10 }, justifyContent: 'center' }}
    >
      <Label
        value="NEXT ROUND"
        fontSize={30}
        color={Color4.create(1, 1, 1, 0.75)}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
  </UiEntity>
)
