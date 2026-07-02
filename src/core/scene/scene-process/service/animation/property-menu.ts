import type { IAnimationPropertyInfo } from '../../../common';

export const DEFAULT_PROPERTIES: IAnimationPropertyInfo[] = [
    createPropertyInfo('position', 'cc.Vec3'),
    createPropertyInfo('eulerAngles', 'cc.Vec3', 'rotation(eulerAngles)'),
    createPropertyInfo('rotation', 'cc.Quat', 'rotation(quaternion)'),
    createPropertyInfo('scale', 'cc.Vec3'),
];

export const ACTIVE_PROPERTY = createPropertyInfo('active', 'cc.Boolean');

function createPropertyInfo(name: string, type: string, displayName = name, comp?: string): IAnimationPropertyInfo {
    return {
        name,
        key: comp ? `${comp}.${name}` : name,
        displayName,
        type: { value: type },
        menuName: displayName,
        comp,
    };
}
