# Friendzone Buildathon

Decentraland Friendzone Mobile Buildathon の提出作品。
**締切: 2026-09-04 09:00 JST（＝実質 9/3 いっぱい）**

SDK7の一般的な作法・落とし穴は `~/.claude/skills/decentraland-sdk7/SKILL.md` が正。
このファイルはこのプロジェクト固有のことだけ書く。

## 起動

**Node 24 系が必要**（`@dcl/hammurabi-server` の対応は 22 か 24 のみ。26 では起動を拒否される）。

```bash
node -v          # v24.x であること
npm run start
```

Node 22.2 では ESM を require できずマルチプレイヤーサーバーだけが落ちるため
`NODE_OPTIONS="--experimental-require-module"` が必要だったが、24 では不要。
デプロイ時の `Could not convert argument of type symbol to string`（undici 6 のバグ）も
24 で解消する。

アプリは**終了して数秒待ってから**一度だけ開く（手順の詳細はスキル側）。

```bash
open "decentraland://realm=http%3A%2F%2F127.0.0.1%3A8000&position=0%2C0&dclenv=org&local-scene=true"
```

## デプロイ

```bash
npm run deploy -- --target-content https://worlds-content-server.decentraland.org
```

ブラウザが開くのでウォレットで署名する。デプロイ先は `kenji.dcl.eth`。

**`npm install` の直後は、先に `sdk-commands` へ修正を当て直すこと。**
`node_modules/@dcl/sdk-commands/dist/linker-dapp/routes.js` の `/auth/(.*)` ハンドラが
受信ヘッダーをスプレッドしており、`Headers` オブジェクトの `Symbol(map)` まで複製して
`fetch` が落ちる（`Proxy error: ... is a symbol`）。当て方はスキル側に記載。

## 構成

- `src/shared/config.ts` — **調整用の数字は全部ここ**。玉の数・所持時間・拾える距離・追従の間隔など
- `src/shared/schemas.ts` — 同期コンポーネント。更新頻度で分けてある（Pulse / SharedState / Leaderboard / Orb）
- `src/server/` — 状態の権威。拾える判定・落下・勝利・保存
- `src/client/` — 見た目とUI。玉の描画・追従・リーダーボード表示

要項と企画の経緯は `BRIEF.md`。

## このプロジェクト固有の決めごと

- **玉の見た目は仮**（組み込みの球）。モデルができたら `GLTFContainer` に差し替える前提
- **持っている間の玉の位置は同期しない**。サーバーは「誰が持っているか」だけを共有し、
  追従の見た目は各クライアントがローカルで描く（毎フレーム位置を送ると通信量が跳ね上がるため）
- **追従は位置履歴を使う**。`AvatarAttach` は骨に瞬間追従する仕組みで、遅れて付いてくる動きは作れない。
  止まると履歴が1点に潰れるので、動いていない間は向き基準の隊列に混ぜている
- **玉は今すべて地面（y=0.5）**。地形ができたら段の高さに合わせて `ORB_SPAWNS` を置き直す
- **ドラゴンボールの名称・意匠は使わない**（構造を参考にしただけ。商標・キャラクター権利の都合）

## 残っていること

**締切: 9/4 09:00 JST（実質 9/3 いっぱい）**

必須:
1. **地形版のデプロイ**（前回のデプロイは地形が入る前のもの）
2. **DoraHacksへの提出** — リポジトリURL・説明文・ワールドURL

やりたいこと（2026-09-02 時点のメモ）:
3. **取得時の効果音**（音源ファイルが必要）
4. **ルールの視覚化** — いまは文字だけ。図や動きで伝えたい
5. **集める対象の再検討** — 球でなくてもよい。モデル差し替えは
   `src/client/orbs.ts` の `MeshRenderer.setSphere` を `GltfContainer` にするだけ

済み:
- 参加/離脱ボタン、ラウンド制、リーダーボード、永続化
- 地形（`assets/models/terrain.glb`）とラウンドごとのランダム配置
- 公開リポジトリ https://github.com/kenji08/friendzone-buildathon
- モバイル実機での動作確認（地形が入る前の版）
