import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { SharedState } from '../shared/schemas'
import { isReady } from './setup'

/**
 * モバイルの予約領域を避ける。
 * 画面左＝ジョイスティック、右下＝インタラクト/チャット/プロフィール。
 * 自前のUIは上部中央に寄せる。
 */
export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

function readTotal(): number {
  for (const [, state] of engine.getEntitiesWith(SharedState)) {
    return state.total
  }
  return 0
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'flex-start',
      pointerFilter: 'none'
    }}
  >
    <UiEntity
      uiTransform={{ margin: { top: '4%' }, padding: 12 }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <Label
        value={isReady() ? `${readTotal()}` : '接続中…'}
        fontSize={42}
        color={Color4.White()}
        textAlign="middle-center"
      />
    </UiEntity>
  </UiEntity>
)
