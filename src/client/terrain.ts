import { ColliderLayer, GltfContainer, Transform, engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

/**
 * 地形。GLBは原点を中心に -16〜16 で作られているので、
 * シーンの座標系（0〜32）に合わせて中心へ寄せる。
 *
 * コライダーはモデル側に用意していないため、ここで指定する。
 * これが無いと地形をすり抜けて落ちる。
 */
export function initTerrain() {
  const terrain = engine.addEntity()
  Transform.create(terrain, { position: Vector3.create(16, 0, 16) })
  GltfContainer.create(terrain, {
    src: 'assets/models/terrain.glb',
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
}
