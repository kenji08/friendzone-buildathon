import { engine } from '@dcl/sdk/ecs'
import { HEARTBEAT_TIMEOUT, SharedState } from '../shared/schemas'
import { initOrbs } from './orbs'
import { sampleSystem } from './trail'

let elapsed = 0
let lastBeat = 0
let lastBeatSeenAt = 0
let serverOnline = false
let rounds = 0

export function initClient() {
  console.log('[CLIENT] starting…')

  engine.addSystem(sampleSystem)
  initOrbs()
  engine.addSystem(trackServerSystem)
}

/**
 * サーバーの生存はハートビートで判断する。
 * isStateSyncronized() は通信が繋がったかしか分からず、
 * サーバーが動いているかは分からないため。
 */
function trackServerSystem(dt: number) {
  elapsed += dt

  for (const [, state] of engine.getEntitiesWith(SharedState)) {
    rounds = state.rounds
    if (state.heartbeat !== lastBeat) {
      lastBeat = state.heartbeat
      lastBeatSeenAt = elapsed
    }
    break
  }

  serverOnline = lastBeat !== 0 && elapsed - lastBeatSeenAt < HEARTBEAT_TIMEOUT
}

export function isReady(): boolean {
  return serverOnline
}

export function getRounds(): number {
  return rounds
}
