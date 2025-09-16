import { AnimationClip } from 'cc';
import { CCON, encodeCCONBinary } from 'cc/editor/serialization';

/**
 * 将对象序列化为存储在库文件夹中应有的格式。
 * @param value
 */
export function serializeForLibrary(value: unknown): {
    extension: '.json';
    data: string;
} | {
    extension: '.bin';
    data: Uint8Array;
} {
    let serializeCompiled = false;
    const serializeOptions: Record<string, unknown> & {
        useCCON?: boolean;
        _exporting?: boolean;
        dontStripDefault?: boolean;
    } = {};
    switch (true) {
        default:
            break;
        case isDirectInstanceOf(value, AnimationClip):
            serializeCompiled = false;
            serializeOptions._exporting = false;
            serializeOptions.dontStripDefault = false;
            serializeOptions.useCCON = true;
            break;
    }

    const data = (serializeCompiled ? EditorExtends.serializeCompiled : EditorExtends.serialize)(value, serializeOptions);
    if (data instanceof CCON) {
        const cconb = encodeCCONBinary(data);
        return {
            data: cconb,
            extension: '.bin',
        };
    } else {
        return {
            data,
            extension: '.json',
        };
    }
}

function isDirectInstanceOf<T extends new(...args: any) => any>(value: unknown, type: T): value is InstanceType<T> {
    return (value && Object.getPrototypeOf(value) === type.prototype) as boolean;
}
