import {
    applyJointChanges,
    extractPrefabJointPaths,
    jointMasksToDump,
    normalizeJointMasks,
} from '../animation-mask-utils';

describe('animation mask helpers', () => {
    test('extractPrefabJointPaths skips the prefab root and keeps Creator path semantics', () => {
        const prefab = [
            { __type__: 'cc.Prefab' },
            { __type__: 'cc.Node', _name: 'Root', _children: [{ __id__: 2 }, { __id__: 5 }] },
            { __type__: 'cc.Node', _name: 'Hips', _children: [{ __id__: 3 }, { __id__: 4 }] },
            { __type__: 'cc.Node', _name: 'Spine', _children: [] },
            { __type__: 'cc.Node', _name: 'Leg', _children: [] },
            { __type__: 'cc.Node', _name: 'Arm', _children: [] },
        ];

        expect(extractPrefabJointPaths(prefab)).toEqual([
            'Hips',
            'Hips/Spine',
            'Hips/Leg',
            'Arm',
        ]);
    });

    test('extractPrefabJointPaths rejects duplicate paths', () => {
        const prefab = [
            { __type__: 'cc.Prefab' },
            { __type__: 'cc.Node', _name: 'Root', _children: [{ __id__: 2 }, { __id__: 3 }] },
            { __type__: 'cc.Node', _name: 'Bone', _children: [] },
            { __type__: 'cc.Node', _name: 'Bone', _children: [] },
        ];

        expect(() => extractPrefabJointPaths(prefab)).toThrow('Duplicate skeleton joint path: Bone');
    });

    test('jointMasksToDump builds a tree from explicit parent paths only', () => {
        const dump = jointMasksToDump('mask-uuid', normalizeJointMasks([
            { path: 'Root/Child', enabled: false },
            { path: 'Root', enabled: true },
            { path: 'Orphan/Leaf', enabled: true },
        ]));

        expect(dump).toEqual({
            version: 1,
            assetUuid: 'mask-uuid',
            joints: [
                { path: 'Orphan/Leaf', enabled: true },
                {
                    path: 'Root',
                    enabled: true,
                    children: [
                        { path: 'Root/Child', enabled: false },
                    ],
                },
            ],
        });
    });

    test('applyJointChanges defaults to non-recursive and supports explicit recursive updates', () => {
        const masks = normalizeJointMasks([
            { path: 'Root', enabled: true },
            { path: 'Root/Child', enabled: true },
            { path: 'Other', enabled: true },
        ]);

        expect(applyJointChanges(masks, [{ path: 'Root', enabled: false }])).toEqual([
            { __type__: 'cc.JointMask', path: 'Root', enabled: false },
            { __type__: 'cc.JointMask', path: 'Root/Child', enabled: true },
            { __type__: 'cc.JointMask', path: 'Other', enabled: true },
        ]);

        expect(applyJointChanges(masks, [{ path: 'Root', enabled: false, recursive: true }])).toEqual([
            { __type__: 'cc.JointMask', path: 'Root', enabled: false },
            { __type__: 'cc.JointMask', path: 'Root/Child', enabled: false },
            { __type__: 'cc.JointMask', path: 'Other', enabled: true },
        ]);
    });
});
