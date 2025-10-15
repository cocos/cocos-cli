// 基础向量和矩阵类型
export interface IVec3 {
    x: number; // x 轴坐标
    y: number; // y 轴坐标
    z: number; // z 轴坐标
}

export interface IQuat {
    x: number; // 旋转轴的 x 分量
    y: number; // 旋转轴的 y 分量
    z: number; // 旋转轴的 z 分量
    w: number; // 旋转角度的余弦半角（实部）
}

export interface IMat4 {
    m00: number; // 0列0行
    m01: number; // 0列1行
    m02: number; // 0列2行
    m03: number; // 0列3行
    m04: number; // 1列0行
    m05: number; // 1列1行
    m06: number; // 1列2行
    m07: number; // 1列3行
    m08: number; // 2列0行
    m09: number; // 2列1行
    m10: number; // 2列2行
    m11: number; // 2列3行
    m12: number; // 3列0行
    m13: number; // 3列1行
    m14: number; // 3列2行
    m15: number; // 3列3行
}