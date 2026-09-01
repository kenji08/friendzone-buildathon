"""
terrain.glb から地面の高さ表を抜き出して TypeScript のファイルにする。

実行時にレイキャストで地面を測る方法もあるが、マルチプレイヤーサーバーで
使えるかが公式ドキュメントで確認できない。地面の高さはサーバーが決めるべき値
（クライアント任せにすると位置が食い違う）なので、両者が同じ表を見る形にした。

地形を作り直したら、これを実行して表を更新する:
    python3 scripts/bake-terrain-heights.py
"""

import json
import struct

GLB = 'assets/models/terrain.glb'
OUT = 'src/shared/terrain-heights.ts'
GRID = 33          # 0m から 32m まで 1m 刻み
MODEL_OFFSET = 16.0  # モデルは原点中心（-16..16）、シーンは 0..32


def read_glb(path):
    data = open(path, 'rb').read()
    off = 12
    gltf = None
    binary = None
    while off < len(data):
        length, kind = struct.unpack('<I4s', data[off:off + 8])
        chunk = data[off + 8:off + 8 + length]
        if kind.rstrip(b'\x00') == b'JSON':
            gltf = json.loads(chunk.decode('utf-8'))
        elif kind.rstrip(b'\x00') == b'BIN':
            binary = chunk
        off += 8 + length
    return gltf, binary


def positions(gltf, binary):
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            acc = gltf['accessors'][prim['attributes']['POSITION']]
            view = gltf['bufferViews'][acc['bufferView']]
            base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
            stride = view.get('byteStride') or 12
            for i in range(acc['count']):
                yield struct.unpack_from('<fff', binary, base + i * stride)


def main():
    gltf, binary = read_glb(GLB)
    if binary is None:
        raise SystemExit('GLBにバイナリチャンクが見つかりません')

    # 格子点ごとに、集まった頂点の最も高い値を採る（地表の上面）
    grid = [[None] * GRID for _ in range(GRID)]
    total = 0
    for x, y, z in positions(gltf, binary):
        total += 1
        gx = round(x + MODEL_OFFSET)
        gz = round(z + MODEL_OFFSET)
        if 0 <= gx < GRID and 0 <= gz < GRID:
            if grid[gx][gz] is None or y > grid[gx][gz]:
                grid[gx][gz] = y

    missing = sum(1 for a in range(GRID) for b in range(GRID) if grid[a][b] is None)
    for a in range(GRID):
        for b in range(GRID):
            if grid[a][b] is None:
                grid[a][b] = 0.0

    values = [grid[a][b] for a in range(GRID) for b in range(GRID)]
    print(f'頂点 {total:,} / 未サンプルの格子点 {missing}')
    print(f'高さ {min(values):.2f}m 〜 {max(values):.2f}m')

    rows = ',\n  '.join(
        '[' + ', '.join(f'{grid[a][b]:.2f}' for b in range(GRID)) + ']'
        for a in range(GRID)
    )

    open(OUT, 'w').write(f'''/**
 * 地形の高さ表。terrain.glb から 1m 刻みで抜き出したもの。
 * scripts/bake-terrain-heights.py が生成する。手で編集しない。
 *
 * 実行時にレイキャストで測る方法もあるが、マルチプレイヤーサーバーで
 * 使えるかがドキュメントで確認できない。地面の高さはサーバーが決めるべき値
 * なので、サーバーとクライアントが同じ表を見る形にしてある。
 */

/** 格子の一辺の点数（0m から 32m まで 1m 刻み） */
export const HEIGHT_GRID_SIZE = {GRID}

/** [x][z] の順。値はその地点の地面の高さ（メートル） */
export const TERRAIN_HEIGHTS: number[][] = [
  {rows}
]

/** 任意の地点の地面の高さ。格子の間は四隅から線形補間する */
export function groundHeightAt(x: number, z: number): number {{
  const max = HEIGHT_GRID_SIZE - 1
  const cx = Math.min(Math.max(x, 0), max)
  const cz = Math.min(Math.max(z, 0), max)

  const x0 = Math.floor(cx)
  const z0 = Math.floor(cz)
  const x1 = Math.min(x0 + 1, max)
  const z1 = Math.min(z0 + 1, max)

  const tx = cx - x0
  const tz = cz - z0

  const top = TERRAIN_HEIGHTS[x0][z0] + (TERRAIN_HEIGHTS[x1][z0] - TERRAIN_HEIGHTS[x0][z0]) * tx
  const bottom = TERRAIN_HEIGHTS[x0][z1] + (TERRAIN_HEIGHTS[x1][z1] - TERRAIN_HEIGHTS[x0][z1]) * tx
  return top + (bottom - top) * tz
}}
''')
    print('書き出し:', OUT)


if __name__ == '__main__':
    main()
