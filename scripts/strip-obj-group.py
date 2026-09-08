#!/usr/bin/env python3
"""
OBJ から不要なグループを除いた OBJ を書き出す。

note.obj には地面用の Plane01 が同梱されていて、これがバウンディングボックスを
6622 単位まで広げてしまう。Blender の OBJ 取り込みではグループが別オブジェクトに
ならないため、取り込む前に落としておく。

    python3 scripts/strip-obj-group.py assets/models/note.obj note_quaver out.obj
"""
import sys


def main():
    src, keep_group, dst = sys.argv[1], sys.argv[2], sys.argv[3]

    positions, texcoords, normals = [], [], []
    faces = []
    current = None

    for line in open(src):
        parts = line.split()
        if not parts:
            continue
        tag = parts[0]

        if tag == 'v':
            positions.append(parts[1:4])
        elif tag == 'vt':
            texcoords.append(parts[1:3])
        elif tag == 'vn':
            normals.append(parts[1:4])
        elif tag in ('g', 'o'):
            current = parts[1] if len(parts) > 1 else None
        elif tag == 'f' and current == keep_group:
            faces.append(parts[1:])

    if not faces:
        sys.exit(f'グループ {keep_group} の面が見つかりません')

    # 使われている頂点だけを集めて番号を振り直す
    used_v, used_vt, used_vn = {}, {}, {}

    def remap(table, store, index):
        # OBJ の添字は1始まり。負値は末尾からの相対指定
        i = int(index)
        i = len(store) + i if i < 0 else i - 1
        if i not in table:
            table[i] = len(table) + 1
        return table[i]

    out_faces = []
    for face in faces:
        corners = []
        for corner in face:
            v, vt, vn = (corner.split('/') + ['', ''])[:3]
            piece = str(remap(used_v, positions, v))
            if vt:
                piece += '/' + str(remap(used_vt, texcoords, vt))
            elif vn:
                piece += '/'
            if vn:
                piece += '/' + str(remap(used_vn, normals, vn))
            corners.append(piece)
        out_faces.append('f ' + ' '.join(corners))

    def emit(table, store, prefix):
        lines = [None] * len(table)
        for original, new in table.items():
            lines[new - 1] = prefix + ' ' + ' '.join(store[original])
        return lines

    with open(dst, 'w') as f:
        f.write(f'# {keep_group} のみ抽出\n')
        f.write('\n'.join(emit(used_v, positions, 'v')) + '\n')
        if used_vt:
            f.write('\n'.join(emit(used_vt, texcoords, 'vt')) + '\n')
        if used_vn:
            f.write('\n'.join(emit(used_vn, normals, 'vn')) + '\n')
        f.write(f'g {keep_group}\n')
        f.write('\n'.join(out_faces) + '\n')

    print(f'{dst}: 頂点 {len(used_v)} / 面 {len(out_faces)}')


main()
