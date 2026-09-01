import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import { WIN_BANNER_DURATION } from '../shared/config'
import { room } from '../shared/messages'
import {
  HEARTBEAT_TIMEOUT,
  Leaderboard,
  LeaderboardEntry,
  PHASE_PLAYING,
  PHASE_RESULT,
  PHASE_STARTING,
  PHASE_WAITING,
  Participant,
  Participants,
  Pulse,
  SharedState
} from '../shared/schemas'
import { initOrbs } from './orbs'
import { initTerrain } from './terrain'
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

let roster: Participant[] = []
let rosterJson = ''
let selfAddress = ''
let winnerName = ''
let rejectedUntil = 0
let rejectReason = ''

export function initClient() {
  console.log('[CLIENT] starting…')

  room.onMessage('won', (data) => {
    rounds = data.rounds
    winnerName = data.name || shorten(data.winner)
    bannerUntil = elapsed + WIN_BANNER_DURATION
    console.log('[CLIENT] win by', winnerName, '— round', data.rounds)
  })

  room.onMessage('joinRejected', (data) => {
    rejectReason = data.reason
    rejectedUntil = elapsed + 4
    console.log('[CLIENT] join rejected:', data.reason)
  })

  initTerrain()
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

  selfAddress = (player?.userId ?? '').toLowerCase()
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
      board = parseJson<LeaderboardEntry>(data.json)
    }
    break
  }

  for (const [, data] of engine.getEntitiesWith(Participants)) {
    if (data.json !== rosterJson) {
      rosterJson = data.json
      roster = parseJson<Participant>(data.json)
    }
    break
  }

  serverOnline = lastBeat !== 0 && elapsed - lastBeatSeenAt < HEARTBEAT_TIMEOUT
}

function parseJson<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function shorten(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
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

export function isWaiting(): boolean {
  return phase === PHASE_WAITING
}

export function isStarting(): boolean {
  return phase === PHASE_STARTING
}

export function isResult(): boolean {
  return phase === PHASE_RESULT
}

/** ラウンド開始までの残り秒数。開始待ちでなければ0 */
export function secondsToNextRound(): number {
  if (phase !== PHASE_STARTING || roundStartsAt === 0) return 0
  return Math.max(0, Math.ceil((roundStartsAt - Date.now()) / 1000))
}

export function getRoster(): Participant[] {
  return roster
}

/** 自分がラウンドに参加しているか */
export function amParticipating(): boolean {
  if (selfAddress === '') return false
  return roster.some((p) => p.address.toLowerCase() === selfAddress)
}

export function getWinnerName(): string {
  return winnerName
}

/** 参加を断られた時のメッセージ。数秒だけ出す */
export function joinRejection(): string {
  return elapsed < rejectedUntil ? rejectReason : ''
}

export function joinRound() {
  room.send('join', {})
}

export function leaveRound() {
  room.send('leave', {})
}

/** 勝利表示を出しておく間だけ true */
export function showingWin(): boolean {
  return elapsed < bannerUntil
}

export function getLeaderboard(): LeaderboardEntry[] {
  return board
}
