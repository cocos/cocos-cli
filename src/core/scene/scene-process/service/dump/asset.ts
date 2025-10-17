'use strict';

import { gfx } from 'cc';
const { Type } = gfx;

const GFXToValueTypeMap: Record<string | number, string> = {
    boolean: 'Boolean',
    number: 'Number',
    string: 'String',

    [Type.INT]: 'Integer',
    [Type.INT2]: 'cc.Vec2',
    [Type.INT3]: 'cc.Vec3',
    [Type.INT4]: 'cc.Vec4',

    [Type.FLOAT]: 'Float',
    [Type.FLOAT2]: 'cc.Vec2',
    [Type.FLOAT3]: 'cc.Vec3',
    [Type.FLOAT4]: 'cc.Vec4',

    [Type.MAT4]: 'cc.Mat4',

    [Type.SAMPLER2D]: 'cc.TextureBase',
    [Type.SAMPLER_CUBE]: 'cc.TextureCube',
};

class AssetUtil {
    get GFXToValueTypeMap() {
        return GFXToValueTypeMap;
    }

    getDefaultValue(type: string, data?: any) {
        switch (type) {
            case 'Boolean':
                if (data) {
                    return data[0];
                }
                return false;
            case 'Number':
            case 'Integer':
            case 'Float':
                if (data) {
                    return data[0];
                }
                return 0;
            case 'String':
                if (data) {
                    return data[0];
                }
                return '';
            case 'cc.Vec2':
                if (data) {
                    return new cc.math.Vec2(data[0] || 0, data[1] || 0);
                }
                return new cc.Vec2();
            case 'cc.Vec3':
                if (data) {
                    return new cc.math.Vec3(data[0] || 0, data[1] || 0, data[2] || 0);
                }
                return new cc.Vec3();
            case 'cc.Vec4':
                if (data) {
                    return new cc.math.Vec4(data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 0);
                }
                return new cc.Vec4();
            case 'cc.Quat':
                if (data) {
                    return new cc.math.Quat(data[0] || 0, data[1] || 0, data[2] || 0, data[3] || 1);
                }
                return new cc.Quat();
            case 'cc.Color':
                if (Array.isArray(data)) {
                    if (data[3] === undefined) {
                        data[3] = 1;
                    }
                    return new cc.Color(data[0] * 255, data[1] * 255, data[2] * 255, data[3] * 255);
                }
                return new cc.Color();
            case 'cc.Mat4':
                if (Array.isArray(data)) {
                    return new cc.math.Mat4(
                        data[0],
                        data[1],
                        data[2],
                        data[3],
                        data[4],
                        data[5],
                        data[6],
                        data[7],
                        data[8],
                        data[9],
                        data[10],
                        data[11],
                        data[12],
                        data[13],
                        data[14],
                        data[15],
                    );
                }
                return new cc.Mat4();
            case 'cc.Asset':
                return new cc.Asset();
            case 'cc.TextureBase':
                return new cc.TextureBase();
            case 'cc.Texture2D':
                return new cc.Texture2D();
            case 'cc.TextureCube':
                return new cc.TextureCube();
        }
        return false;
    }
}

export default new AssetUtil();
