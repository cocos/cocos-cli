import z from 'zod';

export const SchemaVec3 = z.object({
    x: z.number().describe('X axis coordinate'), // x 轴坐标
    y: z.number().describe('Y axis coordinate'), // y 轴坐标
    z: z.number().describe('Z axis coordinate'), // z 轴坐标
});

// Quaternion // 四元数
export const SchemaQuat = z.object({
    x: z.number().describe('X component of rotation axis'), // 旋转轴的 x 分量
    y: z.number().describe('Y component of rotation axis'), // 旋转轴的 y 分量
    z: z.number().describe('Z component of rotation axis'), // 旋转轴的 z 分量
    w: z.number().describe('Cosine half-angle of rotation (Real part)'), // 旋转角度的余弦半角（实部）
});

// Matrix // 矩阵
export const SchemaMat4 = z.object({
    m00: z.number().describe('Column 0 Row 0'), // 0列0行
    m01: z.number().describe('Column 0 Row 1'), // 0列1行
    m02: z.number().describe('Column 0 Row 2'), // 0列2行
    m03: z.number().describe('Column 0 Row 3'), // 0列3行
    m04: z.number().describe('Column 1 Row 0'), // 1列0行
    m05: z.number().describe('Column 1 Row 1'), // 1列1行
    m06: z.number().describe('Column 1 Row 2'), // 1列2行
    m07: z.number().describe('Column 1 Row 3'), // 1列3行
    m08: z.number().describe('Column 2 Row 0'), // 2列0行
    m09: z.number().describe('Column 2 Row 1'), // 2列1行
    m10: z.number().describe('Column 2 Row 2'), // 2列2行
    m11: z.number().describe('Column 2 Row 3'), // 2列3行
    m12: z.number().describe('Column 3 Row 0'), // 3列0行
    m13: z.number().describe('Column 3 Row 1'), // 3列1行
    m14: z.number().describe('Column 3 Row 2'), // 3列2行
    m15: z.number().describe('Column 3 Row 3'), // 3列3行
});