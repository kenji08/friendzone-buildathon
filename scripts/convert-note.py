"""
音符の OBJ を Decentraland 用の GLB に変換する。

先に地面用の板を落としておくこと:

  python3 scripts/strip-obj-group.py assets/models/note.obj note_quaver build/note_quaver.obj
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python scripts/convert-note.py

やっていること:
  1. 板を除いた OBJ を読み込む
  2. Decimate でポリゴンを削る（32個並べるので1個あたりを軽くする必要がある）
  3. 原点を中心に寄せ、高さが目標の大きさになるよう正規化
  4. GLB で書き出す
"""
import math
import os
import sys

import bpy

# 地面用の板を除いたもの。scripts/strip-obj-group.py が作る
SRC = os.path.abspath('build/note_quaver.obj')
DST = os.path.abspath('assets/models/note.glb')

# 球（直径0.7m）より少し大きく
TARGET_HEIGHT = 1.0

# 1個あたりの目標三角形数。32個並べても地形と合わせて上限に余裕が出る量
TARGET_TRIS = 250

# 音符の色。金色寄りの黄色
BASE_COLOR = (0.95, 0.72, 0.20, 1.0)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_obj():
    # Blender 4系は wm.obj_import、3系は import_scene.obj
    if hasattr(bpy.ops.wm, 'obj_import'):
        bpy.ops.wm.obj_import(filepath=SRC)
    else:
        bpy.ops.import_scene.obj(filepath=SRC)


def join_meshes():
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes:
        sys.exit('メッシュがありません')

    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def triangle_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def decimate(obj, target):
    before = triangle_count(obj)
    if before <= target:
        print(f'  三角形 {before} — 削減は不要')
        return

    modifier = obj.modifiers.new(name='Decimate', type='DECIMATE')
    modifier.ratio = max(0.01, target / before)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    print(f'  三角形 {before} -> {triangle_count(obj)}')


def normalise(obj):
    """原点を中心に置き、縦に立てて、いちばん長い辺を TARGET_HEIGHT に合わせる。"""
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    obj.location = (0, 0, 0)

    d = obj.dimensions
    print(f'  取り込み時: {d.x:.0f} x {d.y:.0f} x {d.z:.0f}')

    # 元データは Y が高さ。Blender は Z が上なので、寝ていたら起こす。
    # glTF は Y が上で、書き出し時にまた変換されるため、ここでは Blender の向きに揃える。
    if obj.dimensions.y > obj.dimensions.z:
        obj.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        print('  縦に起こした')

    # 軸の取り違えを避けるため、特定の軸ではなく最長辺を基準にする
    longest = max(obj.dimensions)
    obj.scale = tuple([TARGET_HEIGHT / max(longest, 1e-6)] * 3)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    d = obj.dimensions
    print(f'  仕上がり: {d.x:.2f} x {d.y:.2f} x {d.z:.2f} m')


def add_material(obj):
    """マテリアルが無い glTF は Decentraland 側で扱いが不安定なので必ず付ける。"""
    material = bpy.data.materials.new(name='Note')
    material.use_nodes = True
    principled = material.node_tree.nodes.get('Principled BSDF')
    if principled:
        principled.inputs['Base Color'].default_value = BASE_COLOR
        # 反射を抑えて、低ポリらしいマットな見え方にする
        principled.inputs['Roughness'].default_value = 0.85
        if 'Metallic' in principled.inputs:
            principled.inputs['Metallic'].default_value = 0.0

    obj.data.materials.clear()
    obj.data.materials.append(material)
    print(f'  マテリアル: {material.name}')


def main():
    clear_scene()
    import_obj()

    obj = join_meshes()
    decimate(obj, TARGET_TRIS)
    normalise(obj)

    add_material(obj)

    # 低ポリらしい平面的な陰影にする
    bpy.ops.object.shade_flat()

    bpy.ops.export_scene.gltf(
        filepath=DST,
        export_format='GLB',
        export_draco_mesh_compression_enable=False,  # モバイルで読めなくなる
        export_apply=True,
        use_selection=False,
    )
    print(f'書き出し: {DST}')


main()
