# Friendzone Buildathon — orb gathering

A mobile-first social experience for Decentraland, built for the
[Friendzone Mobile Buildathon](https://dorahacks.io/hackathon/friendzone)
by DCL Regenesis Labs.

**Work in progress.** Visuals are placeholders while the mechanics are tuned.

## What it is

Orbs are scattered around a small arena. Walk near one and it brightens; tap to
pick it up. What you carry trails behind you, visible to everyone else, and slips
out of your hands after a while and drops where you stand. Gather enough and the
round is yours — then the orbs scatter again and the next round begins.

Nothing needs a host or a scheduled event. Walk in at any time and play.

## Design notes

- **Touch only.** Walking and tapping are the whole input vocabulary. No precise
  timing, no small targets, no typing.
- **Nothing can be hoarded.** Carried orbs return to the ground on a timer, so
  what one player collects becomes everyone else's opportunity.
- **The server owns the state.** Pickups are validated against server-verified
  player positions, and results persist across restarts, so the world remembers
  what happened while you were away.
- **Sound and light replace chat.** Proximity is communicated by how strongly an
  orb glows, so players can read the situation without talking.

## Running locally

Requires **Node 24** and the Decentraland desktop app. The multiplayer server
supports Node 22 and 24 only, and refuses to start on newer releases.

```bash
npm install
npm run start
```

On Node 22.2 the multiplayer server exits on startup because it loads an ES
module through `require`; run with `NODE_OPTIONS="--experimental-require-module"`
if you are stuck on that version. The preview itself starts either way, so the
failure is easy to miss — check the log for `Multiplayer Server exited`.

Then quit the Decentraland app if it is running, wait a moment, and open:

```
decentraland://realm=http%3A%2F%2F127.0.0.1%3A8000&position=0%2C0&dclenv=org&local-scene=true
```

## Layout

```
src/
├── index.ts          entry point, branches on isServer()
├── shared/
│   ├── config.ts     every tunable number lives here
│   ├── schemas.ts    synced components, split by update frequency
│   └── messages.ts   client/server message definitions
├── server/           authoritative state: pickups, drops, rounds, storage
└── client/           rendering, trailing orbs, HUD
```

## License

[MIT](LICENSE)
