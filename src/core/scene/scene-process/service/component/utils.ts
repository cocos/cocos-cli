import {
    Node,
    MeshRenderer,
    Vec3,
    SphereCollider,
    BoxCollider,
    UITransformComponent,
    PhysicsSystem2D,
    PolygonCollider2D,
    MeshCollider,
    CapsuleCollider,
    CylinderCollider,
    TerrainCollider,
    Terrain,
    ConeCollider,
    IVec3Like,
    Camera,
    Layers,
} from 'cc';

interface IBoundingBox {
    minPosition: IVec3Like;
    maxPosition: IVec3Like;
}

function getBoundingBox(node: Node) {
    const modelComponent = node.getComponent(MeshRenderer) as MeshRenderer;
    if (!modelComponent || !modelComponent.mesh) {
        return {
            minPosition: Vec3.ZERO,
            maxPosition: Vec3.ZERO,
        };
    }
    return {
        minPosition: modelComponent!.mesh!.minPosition!,
        maxPosition: modelComponent!.mesh!.maxPosition!,
    };
}

function getSize(boundingBox: IBoundingBox) {
    const size = new Vec3();
    Vec3.subtract(size, boundingBox.maxPosition, boundingBox.minPosition);
    return size;
}

function getCenter(boundingBox: IBoundingBox) {
    const size = getSize(boundingBox);
    const center = new Vec3();
    Vec3.scaleAndAdd(center, boundingBox.minPosition, size, 0.5);
    return center;
}

function maxComponent(v: Vec3) {
    return Math.max(v.x, Math.max(v.y, v.z));
}

class ComponentUtils {
    /**
     * 添加组件对应的内部处理方法
     */
    addComponentMap = {
        SphereCollider(component: SphereCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const boundingBox = getBoundingBox(node);
            const boundingSize = getSize(boundingBox);
            if (!Vec3.strictEquals(boundingSize, Vec3.ZERO)) {
                component.radius = maxComponent(boundingSize) / 2;
                component.center = getCenter(boundingBox);
            }
        },

        BoxCollider(component: BoxCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const boundingBox = getBoundingBox(node);
            const boundingSize = getSize(boundingBox);
            if (!Vec3.strictEquals(boundingSize, Vec3.ZERO)) {
                boundingSize.x = boundingSize.x === 0 ? 0.001 : boundingSize.x;
                boundingSize.y = boundingSize.y === 0 ? 0.001 : boundingSize.y;
                boundingSize.z = boundingSize.z === 0 ? 0.001 : boundingSize.z;
                component.size = boundingSize;
                component.center = getCenter(boundingBox);
            }
        },

        ConeCollider(component: ConeCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const boundingBox = getBoundingBox(node);
            const boundingSize = getSize(boundingBox);
            if (!Vec3.strictEquals(boundingSize, Vec3.ZERO)) {
                const radius = Math.max(boundingSize.x, boundingSize.z) / 2;
                const height = boundingSize.y;
                if (radius > 0) {
                    component.radius = radius;
                }
                if (height > 0) {
                    component.height = height;
                }
                component.center = getCenter(boundingBox);
            }
        },

        CylinderCollider(component: CylinderCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const boundingBox = getBoundingBox(node);
            const boundingSize = getSize(boundingBox);
            if (!Vec3.strictEquals(boundingSize, Vec3.ZERO)) {
                const radius = Math.max(boundingSize.x, boundingSize.z) / 2;
                const height = boundingSize.y;
                if (radius > 0) {
                    component.radius = radius;
                }
                if (height > 0) {
                    component.height = height;
                }
                component.center = getCenter(boundingBox);
            }
        },

        CapsuleCollider(component: CapsuleCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const boundingBox = getBoundingBox(node);
            const boundingSize = getSize(boundingBox);
            if (!Vec3.strictEquals(boundingSize, Vec3.ZERO)) {
                const radius = Math.max(boundingSize.x, boundingSize.z) / 2;
                const cylinderHeight = boundingSize.y - radius * 2;
                if (radius > 0) {
                    component.radius = radius;
                    component.cylinderHeight = cylinderHeight > 0 ? cylinderHeight : 0;
                }
                component.center = getCenter(boundingBox);
            }
        },

        MeshCollider(component: MeshCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const model = node.getComponent(MeshRenderer);
            if (model && model.mesh) {
                component.mesh = model.mesh;
            }
        },

        TerrainCollider(component: TerrainCollider, node: Node) {
            if ((node as any)['_prefab']) {
                return;
            }
            const terrain = node.getComponent(Terrain);
            if (terrain && terrain._asset) {
                component.terrain = terrain._asset;
            }
        },

        BoxCollider2D(component: any, node: Node) {
            const trans = component.getComponent(UITransformComponent);
            if (!trans) {
                return;
            }
            const size = trans.contentSize;
            if (size.width !== 0 && size.height !== 0) {
                component.size = cc.size(size);
                component.offset.x = (0.5 - trans.anchorX) * size.width;
                component.offset.y = (0.5 - trans.anchorY) * size.height;
            }
        },

        CircleCollider2D(component: any, node: Node) {
            const trans = component.getComponent(UITransformComponent);
            if (!trans) {
                return;
            }
            const size = trans.contentSize;
            const radius = Math.max(size.width, size.height) / 2;
            if (radius !== 0) {
                component.radius = radius;
            }
        },

        PolygonCollider2D(component: PolygonCollider2D, node: Node) {
            //PhysicsUtils.resetPoints(component);
        },

        Camera(component: Camera, node: Node) {
            //if (cce.SceneFacadeManager['_projectType'] === '2d') {
                component.visibility = Layers.makeMaskInclude([Layers.Enum.UI_3D, Layers.Enum.UI_2D]);
                component.projection = Camera.ProjectionType.ORTHO;
                component.near = 0;
                component.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
            //}
            // if (cce.SceneFacadeManager['_projectType'] === '3d') {
            //     component.visibility = Layers.Enum.DEFAULT;
            //     component.projection = Camera.ProjectionType.PERSPECTIVE;
            //     component.clearFlags = Camera.ClearFlag.SKYBOX;
            // }
        },
    };
}

export default new ComponentUtils();
