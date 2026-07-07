import { Color, Mat4, Vec2, Vec3, Vec4, gfx, renderer } from 'cc';

export interface IMaterialUniformProperty {
    comp: string;
    materialProperty: string;
    materialIndex?: number;
    passIndex: number;
    uniformName: string;
}

export function parseMaterialUniformPropertyKey(propKey: string): IMaterialUniformProperty | null {
    const arrayMatch = /^(.+)\.([^.]+)\.(\d+)\.pass\.(\d+)\.([^.]+)$/.exec(propKey);
    if (arrayMatch) {
        return {
            comp: arrayMatch[1],
            materialProperty: arrayMatch[2],
            materialIndex: Number(arrayMatch[3]),
            passIndex: Number(arrayMatch[4]),
            uniformName: arrayMatch[5],
        };
    }

    const singleMatch = /^(.+)\.([^.]+)\.pass\.(\d+)\.([^.]+)$/.exec(propKey);
    if (!singleMatch) {
        return null;
    }
    return {
        comp: singleMatch[1],
        materialProperty: singleMatch[2],
        passIndex: Number(singleMatch[3]),
        uniformName: singleMatch[4],
    };
}

export function createMaterialUniformPropertyKey(data: IMaterialUniformProperty): string {
    const materialPath = data.materialIndex === undefined
        ? data.materialProperty
        : `${data.materialProperty}.${data.materialIndex}`;
    return `${data.comp}.${materialPath}.pass.${data.passIndex}.${data.uniformName}`;
}

export function queryMaterialUniformTarget(component: Record<string, unknown>, data: IMaterialUniformProperty): { material: any; pass: any } | null {
    const value = component[data.materialProperty];
    const material = data.materialIndex === undefined
        ? value
        : Array.isArray(value) ? value[data.materialIndex] : undefined;
    const pass = material && Array.isArray((material as any).passes) ? (material as any).passes[data.passIndex] : undefined;
    return material && pass ? { material, pass } : null;
}

export function queryMaterialUniformType(pass: any, uniformName: string): string {
    const propInfo = pass?.properties?.[uniformName];
    if (propInfo?.editor?.type === 'color') {
        return 'cc.Color';
    }

    let gfxType: unknown;
    if (typeof pass?.getHandle === 'function' && typeof renderer.Pass?.getTypeFromHandle === 'function') {
        gfxType = renderer.Pass.getTypeFromHandle(pass.getHandle(uniformName));
    }

    return queryGfxValueType(gfxType) || queryGfxValueType(propInfo?.type);
}

export function readMaterialUniformValue(component: Record<string, unknown>, data: IMaterialUniformProperty): unknown {
    const target = queryMaterialUniformTarget(component, data);
    if (!target) {
        return undefined;
    }

    const { material, pass } = target;
    const handle = typeof pass.getHandle === 'function' ? pass.getHandle(data.uniformName) : 0;
    if (!handle) {
        return undefined;
    }

    const type = typeof renderer.Pass?.getTypeFromHandle === 'function'
        ? renderer.Pass.getTypeFromHandle(handle)
        : undefined;
    const sampler1D = (gfx.Type as any).SAMPLER1D ?? (gfx.Type as any).SAMPLER2D;
    if (
        (typeof type === 'number' && sampler1D !== undefined && type >= sampler1D)
        || (type === undefined && isSamplerUniformType(queryMaterialUniformType(pass, data.uniformName)))
    ) {
        return typeof material.getProperty === 'function' ? material.getProperty(data.uniformName, data.passIndex) : undefined;
    }

    const value = createDefaultUniformValue(queryMaterialUniformType(pass, data.uniformName));
    if (typeof pass.getUniform !== 'function') {
        return value;
    }
    return pass.getUniform(handle, value as any);
}

function isSamplerUniformType(type: string): boolean {
    return type === 'cc.TextureBase' || type === 'cc.TextureCube';
}

function queryGfxValueType(type: unknown): string {
    if (typeof type === 'string') {
        return normalizePrimitiveTypeName(type);
    }
    if (typeof type !== 'number') {
        return '';
    }

    const Type = gfx.Type as any;
    switch (type) {
        case Type.INT:
            return 'Integer';
        case Type.INT2:
            return 'cc.Vec2';
        case Type.INT3:
            return 'cc.Vec3';
        case Type.INT4:
            return 'cc.Vec4';
        case Type.FLOAT:
            return 'Float';
        case Type.FLOAT2:
            return 'cc.Vec2';
        case Type.FLOAT3:
            return 'cc.Vec3';
        case Type.FLOAT4:
            return 'cc.Vec4';
        case Type.MAT4:
            return 'cc.Mat4';
        case Type.SAMPLER2D:
            return 'cc.TextureBase';
        case Type.SAMPLER_CUBE:
            return 'cc.TextureCube';
        default:
            return '';
    }
}

function createDefaultUniformValue(type: string): unknown {
    switch (normalizePrimitiveTypeName(type)) {
        case 'cc.Boolean':
            return false;
        case 'cc.Number':
            return 0;
        case 'cc.String':
            return '';
        case 'cc.Vec2':
            return new Vec2();
        case 'cc.Vec3':
            return new Vec3();
        case 'cc.Vec4':
            return new Vec4();
        case 'cc.Color':
            return new Color();
        case 'cc.Mat4':
            return new Mat4();
        default:
            return undefined;
    }
}

function normalizePrimitiveTypeName(type: string): string {
    switch (type) {
        case 'number':
        case 'Number':
        case 'Float':
        case 'Integer':
            return 'cc.Number';
        case 'boolean':
        case 'Boolean':
            return 'cc.Boolean';
        case 'string':
        case 'String':
            return 'cc.String';
        default:
            return type;
    }
}
