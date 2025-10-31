/**
 * 场景模板类型
 */
export const SCENE_TEMPLATE_TYPE = ['2d', '3d', 'quality'] as const;
export type TSceneTemplateType = typeof SCENE_TEMPLATE_TYPE[number];

/**
 * 创建类型
 */
export const CREATE_TYPES = ['scene', 'prefab'] as const;
export type ICreateType = typeof CREATE_TYPES[number];
