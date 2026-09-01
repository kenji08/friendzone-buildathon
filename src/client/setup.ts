import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import { WIN_BANNER_DURATION } from '../shared/config'
import { room } from '../shared/messages'
import {
  HEARTBEAT_TIMEOUT,
  Leaderboard,
  LeaderboardEntry,
  PHASE_PLAYING,
  Pulse,
  SharedState
} from '../shared/schemas'
import { initOrbs } from './orbs'
import { sampleSystem } from './trail'

let elapsed = 0
let lastBeat = 0
let lastBeatSeenAt = 0
let serverOnline = false

let rounds = 0
let phase = PHASE_PLAYING
let roundStartsAt = 0
let bannerUntil = 0
let board: LeaderboardEntry[] = []
let boardJson = ''
let registered = false

export function initClient() {
  console.log('[CLIENT] starting…')

  room.onMessage('won', (data) => {
    rounds = data.rounds
    bannerUntil = elapsed + WIN_BANNER_DURATION
    console.log('[CLIENT] win by', data.winner, '— round', data.rounds)
  })

  engine.addSystem(sampleSystem)
  initOrbs()
  engine.addSystem(trackServerSystem)
  engine.addSystem(registerSystem)
}

/**
 * 表示名をサーバーへ渡す。サーバー側からは名前を読めないため、
 * クライアントが伝えるしかない。身元はサーバーが検証済みアドレスで判断する。
 */
function registerSystem() {
  if (registered || !serverOnline) return

  const player = getPlayer()
  const name = player?.name
  if (!name) return

  room.send('register', { name })
  registered = true
  console.log('[CLIENT] registered as', name)
}

/**
 * サーバーの生存はハートビートで判断する。
 * isStateSyncronized() は通信が繋がったかしか分からず、
 * サーバーが動いているかは分からないため。
 */
function trackServerSystem(dt: number) {
  elapsed += dt

  for (const [, pulse] of engine.getEntitiesWith(Pulse)) {
    if (pulse.heartbeat !== lastBeat) {
      lastBeat = pulse.heartbeat
      lastBeatSeenAt = elapsed
    }
    break
  }

  for (const [, state] of engine.getEntitiesWith(SharedState)) {
    rounds = state.rounds
    phase = state.phase
    roundStartsAt = state.roundStartsAt
    break
  }

  // JSONの解析は中身が変わった時だけ。毎フレーム parse すると無駄が大きい
  for (const [, data] of engine.getEntitiesWith(Leaderboard)) {
    if (data.json !== boardJson) {
      boardJson = data.json
      board = parseBoard(data.json)
    }
    break
  }

  serverOnline = lastBeat !== 0 && elapsed - lastBeatSeenAt < HEARTBEAT_TIMEOUT
}

function parseBoard(json: string): LeaderboardEntry[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function isReady(): boolean {
  return serverOnline
}

export function getRounds(): number {
  return rounds
}

export function isPlaying(): boolean {
  return phase === PHASE_PLAYING
}

/** 次のラウンドまでの残り秒数。休憩中でなければ0 */
export function secondsToNextRound(): number {
  if (phase === PHASE_PLAYING || roundStartsAt === 0) return 0
  return Math.max(0, Math.ceil((roundStartsAt - Date.now()) / 1000))
}

/** 勝利表示を出しておく間だけ true */
export function showingWin(): boolean {
  return elapsed < bannerUntil
}

export function getLeaderboard(): LeaderboardEntry[] {
  return board
}
