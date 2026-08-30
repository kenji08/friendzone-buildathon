import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { MAX_CARRIED } from '../shared/config'
import { carriedByMe } from './orbs'
import { isReady } from './setup'

/**
 * Mobile reserves the left edge (joystick) and the bottom-right corner
 * (interact button, chat, profile). Keep custom UI at the top center.
 *
 * The container carries explicit dimensions: an auto-sized parent can
 * collapse when the label content changes, which made the readout vanish.
 */
export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{
      positionType: 'absolute',
      position: { top: '4%', left: '0%' },
      width: '100%',
      height: 52,
      justifyContent: 'center',
      alignItems: 'center',
      pointerFilter: 'none'
    }}
  >
    <UiEntity
      uiTransform={{
        width: 260,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <Label
        value={isReady() ? `${carriedByMe()} / ${MAX_CARRIED}` : 'Waking up…'}
        fontSize={30}
        color={Color4.White()}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
  </UiEntity>
)
