import { isServer } from '@dcl/sdk/network'
import { initClient } from './client/setup'
import { setupUi } from './client/ui'
import { initServer } from './server/server'

export function main() {
  if (isServer()) {
    initServer()
    return
  }

  initClient()
  setupUi()
}
