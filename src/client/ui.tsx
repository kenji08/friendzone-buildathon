import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { getTotal, isReady } from './setup'

/**
 * Mobile reserves the left edge (joystick) and the bottom-right corner
 * (interact button, chat, profile). Keep custom UI at the top center.
 */
export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
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
        value={isReady() ? `${getTotal()}` : 'Waking up the server…'}
        fontSize={36}
        color={Color4.White()}
        textAlign="middle-center"
      />
    </UiEntity>
  </UiEntity>
)
