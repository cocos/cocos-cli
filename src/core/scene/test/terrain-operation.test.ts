jest.mock('cc', () => {
    class Vec4 {
        constructor(
            public x = 0,
            public y = 0,
            public z = 0,
            public w = 0,
        ) { }

        public set(value: Vec4) {
            this.x = value.x;
            this.y = value.y;
            this.z = value.z;
            this.w = value.w;
            return this;
        }
    }

    return {
        Rect: class { },
        Terrain: class { },
        TerrainBlock: class { },
        Vec2: class { },
        Vec3: class { },
        Vec4,
    };
});

import { Vec4 } from 'cc';
import {
    TerrainHeightOperation,
    TerrainWeightOperation,
} from '../scene-process/service/gizmo/components/terrain/terrain-operation';

function createTerrain() {
    return {
        info: {
            vertexCount: [16, 12],
            weightMapSize: 8,
            blockCount: [2, 3],
        },
    } as never;
}

describe('Terrain point operations', () => {
    it('keeps the first height value for a coordinate and preserves insertion order', () => {
        const operation = new TerrainHeightOperation(createTerrain());

        operation.push(2, 4, 8);
        operation.push(2, 4, 13);
        operation.push(1, 4, 21);
        operation.push(0, 5, 34);

        expect(operation.data).toEqual([
            { x: 2, y: 4, value: 8 },
            { x: 1, y: 4, value: 21 },
            { x: 0, y: 5, value: 34 },
        ]);
    });

    it('keeps the first weight value as a defensive copy for a coordinate', () => {
        const operation = new TerrainWeightOperation(createTerrain());
        const first = new Vec4(0.1, 0.2, 0.3, 0.4);

        operation.push(2, 4, first);
        first.x = 0.9;
        operation.push(2, 4, new Vec4(0.5, 0.6, 0.7, 0.8));
        operation.push(1, 4, new Vec4(1, 0, 0, 0));
        operation.push(0, 5, new Vec4(0, 1, 0, 0));

        expect(operation.data).toHaveLength(3);
        expect(operation.data[0]).toMatchObject({ x: 2, y: 4 });
        expect(operation.data[0].value).toMatchObject({ x: 0.1, y: 0.2, z: 0.3, w: 0.4 });
        expect(operation.data[1]).toMatchObject({ x: 1, y: 4 });
        expect(operation.data[2]).toMatchObject({ x: 0, y: 5 });
    });
});
