/**
 *  对引擎geometry_renderer的封装;
 *  添加接口和引擎一致
 *  由于每帧都需要渲染，所以这个类主要是一个数据收集，在每帧渲染时，flush数据给引擎
 */

export const methods = [
    'addDashedLine',
    'addTriangle',
    'addQuad',
    'addBoundingBox',
    'addCross',
    'addFrustum',
    'addCapsule',
    'addCylinder',
    'addCone',
    'addCircle',
    'addArc',
    'addPolygon',
    'addDisc',
    'addSector',
    'addSphere',
    'addTorus',
    'addOctahedron',
    'addBezier',
    'addMesh',
    'addIndexedMesh',
] as const;

class GeometryRenderer {
    private _renderer: any;
    private _dataMap: Map<string, []>;
    constructor() {
        this._renderer = null;
        this._dataMap = new Map();
        // 初始化map,模拟接口
        methods.forEach(method => {
            this._dataMap.set(method, []);
            Object.defineProperty(this, method, {
                value: (...args: any[]) => {
                    const params = this._dataMap.get(method);
                    // @ts-ignore
                    params?.push(args);
                },

            });
        });
        // this?.addTriangle(new Vec3(0, 0, 0), new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Color(255, 255, 255));
    }

    get renderer() {
        return this._renderer;
    }

    set renderer(renderer: any) {
        this._renderer = renderer;
    }

    // 统一输出数据
    flush() {
        for (const method of this._dataMap.keys()) {
            const params = this._dataMap.get(method);
            params?.forEach(param => {
                // @ts-ignore
                // console.log('插入数据', method, ...param);
                if (this._renderer) {
                    // @ts-ignore
                    this._renderer[method](...param);
                }
            });
        }
    }

    // 移除method对于的数据
    removeData(method: string) {
        this._dataMap.set(method, []);
    }

    // 移除所有数据 
    removeDataAll() {
        methods.forEach(method => {
            this._dataMap.set(method, []);
        });
    }

}

export { GeometryRenderer };
