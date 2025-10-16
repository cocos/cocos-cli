import z from 'zod';

export const Vec3Schema = z.object({
    x: z.number().describe('x 轴坐标'),
    y: z.number().describe('y 轴坐标'),
    z: z.number().describe('z 轴坐标'),
});

//四元数
export const QuatSchema = z.object({
    x: z.number().describe('旋转轴的 x 分量'),
    y: z.number().describe('旋转轴的 y 分量'),
    z: z.number().describe('旋转轴的 z 分量'),
    w: z.number().describe('旋转角度的余弦半角（实部）'),
});

//矩阵
export const Mat4Schema = z.object({
    m00: z.number().describe('0列0行'),
    m01: z.number().describe('0列1行'),
    m02: z.number().describe('0列2行'),
    m03: z.number().describe('0列3行'),
    m04: z.number().describe('1列0行'),
    m05: z.number().describe('1列1行'),
    m06: z.number().describe('1列2行'),
    m07: z.number().describe('1列3行'),
    m08: z.number().describe('2列0行'),
    m09: z.number().describe('2列1行'),
    m10: z.number().describe('2列2行'),
    m11: z.number().describe('2列3行'),
    m12: z.number().describe('3列0行'),
    m13: z.number().describe('3列1行'),
    m14: z.number().describe('3列2行'),
    m15: z.number().describe('3列3行'),
});