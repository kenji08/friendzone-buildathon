import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { MAX_CARRIED } from '../shared/config'
import { LeaderboardEntry } from '../shared/schemas'
import { carriedByMe } from './orbs'
import {
  getLeaderboard,
  getRounds,
  isPlaying,
  isReady,
  secondsToNextRound,
  showingWin
} from './setup'

/**
 * Mobile reserves the left edge (joystick) and the bottom-right corner
 * (interact button, chat, profile). Keep custom UI at the top.
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
    {winBanner()}
  </UiEntity>
)

function statusText(): string {
  if (!isReady()) return 'Waking up…'
  if (!isPlaying()) return `Next round in ${secondsToNextRound()}s`
  return `${carriedByMe()} / ${MAX_CARRIED}`
}

const statusBar = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: '4%', left: '0%' },
      width: '100%',
      height: 92,
      justifyContent: 'center',
      alignItems: 'center'
    }}
  >
    <UiEntity
      uiTransform={{ width: 460, height: 92, justifyContent: 'center', alignItems: 'center' }}
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
  </UiEntity>
)

/** 名前が未登録の相手だけ、アドレスを縮めて出す */
function displayName(entry: LeaderboardEntry): string {
  if (entry.name) return entry.name
  if (entry.address.length <= 10) return entry.address
  return `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`
}

/**
 * 右上に置く。モバイルは左端がジョイスティック、右下がボタン類なので、
 * 空いているのは上側になる。
 */
const leaderboard = () => {
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
        value="Wins"
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

/** 勝利画像は透過PNG。2のべき乗の寸法（1024x512）に整えてある */
const winBanner = () =>
  showingWin() ? (
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
  ) : null
