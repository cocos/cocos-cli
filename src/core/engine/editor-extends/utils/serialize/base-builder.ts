import type { ValueType } from 'cc';
import { BufferBuilder, CCON } from 'cc/editor/serialization';
import { IArrayOptions, IClassOptions, ICustomClassOptions, IObjParsingInfo, PropertyOptions } from './parser';

// 通过 builder 的 API，把当前序列化的所有数据传输给 builder，由 builder 生成具体的序列化格式
export abstract class Builder {
    constructor(options: IBuilderOptions) {
        this.minify = !!options.minify;
        this.stringify = !!('stringify' in options ? options.stringify : true);
        this._useCCON = options.useCCON ?? false;
    }

    /*
     * setProperty_XXX 用于添加一个元素到序列化结构中，通过 owner/key 来关联到现有对象上
     * @method setProperty_XXX
     * @param owner - 持有该对象的父对象，必须是已添加过的对象。如果是根对象则为 null。
     * @param ownerInfo - 父对象的 IObjParsingInfo
     * @param key - 字符串则表示属性名，number 则表示数组索引
     * @param value - 要添加的元素，实际上就等于 owner[key]
     * @param options - 元素参数，不可省略，这是为了匹配形参和实参，优化性能。
     *                  参考 https://mrale.ph/blog/2018/02/03/maybe-you-dont-need-rust-to-speed-up-your-js.html#optimizing-sorting---argument-adaptation
     * @return - value 的 IObjParsingInfo
     */

    // 可直接赋值的字段，可以是任意 JSON 中的值，但是不能是对象。（DataTypeID.SimpleType 可以是 JSON 对象）
    // 包含 undefined（序列化时可能不支持） 和 null。其它类型值都不可为 null。
    abstract setProperty_Raw(owner: object, ownerInfo: IObjParsingInfo, key: string | number, value: any, options: PropertyOptions): void;

    // CCClass 对象，含自定义了序列化函数的对象
    abstract setProperty_Class(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: IClassOptions): IObjParsingInfo;

    // 自定义了序列化函数的对象
    abstract setProperty_CustomizedClass(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: ICustomClassOptions): IObjParsingInfo;

    // 返回是否可被 builder 处理，如无法处理需要 parser 当做普通的 Class 进行解析
    abstract setProperty_ValueType(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, value: ValueType, options: PropertyOptions): IObjParsingInfo | null;

    abstract setProperty_TypedArray(owner: object, ownerInfo: IObjParsingInfo, key: string | number, value: any, options: PropertyOptions): void;

    abstract setProperty_AssetUuid(owner: object, ownerInfo: IObjParsingInfo, key: string | number, uuid: string, options: PropertyOptions): void;

    abstract setProperty_Array(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: IArrayOptions): IObjParsingInfo;

    // JavaScript Primitive Object
    abstract setProperty_Dict(owner: object | null, ownerInfo: IObjParsingInfo | null, key: string | number, options: PropertyOptions): IObjParsingInfo;

    // 之前已经登记过的对象，可以使用这个类型，仅添加引用关系
    abstract setProperty_ParsedObject(ownerInfo: IObjParsingInfo, key: string | number, valueInfo: IObjParsingInfo, formerlySerializedAs: string | null): void;

    abstract setRoot(objInfo: IObjParsingInfo): void;

    // // 标记对象处于被多个参数共同引用的状态
    // markAsSharedObj (obj: any): void;

    dump(): object | string | CCON {
        if (this._useCCON) {
            return this._dumpAsCCON();
        } else {
            return this._dumpAsJson();
        }
    }

    protected abstract finalizeJsonPart(): any;

    protected get hasBinaryBuffer() {
        return this._useCCON;
    }

    protected get mainBufferBuilder() {
        return this._mainBufferBuilder;
    }

    private stringify: boolean;
    private minify: boolean;

    private declare _useCCON: boolean;

    private _mainBufferBuilder = new BufferBuilder();

    private _dumpAsJson() {
        const mainJsonData = this.finalizeJsonPart();
        if (this.stringify) {
            return JSON.stringify(mainJsonData, null, this.minify ? 0 : 2);
        }
        else {
            return mainJsonData;
        }
    }

    private _dumpAsCCON() {
        const json = this.finalizeJsonPart();
        const { _mainBufferBuilder: mainBufferBuilder } = this;
        const chunks: Uint8Array[] = mainBufferBuilder.byteLength === 0
            ? []
            : [mainBufferBuilder.get()];
        return new CCON(json, chunks);
    }
}

export interface IBuilderOptions {
    builder?: 'dynamic' | 'compiled';
    // indicates whether needs to convert the result by JSON.stringify, default is true
    stringify?: boolean;
    // default is false
    minify?: boolean;
    // default is true
    noNativeDep?: boolean;
    // 强制内联所有数据，不要出现 __id__，简化解析逻辑，如不支持将会抛出异常
    // 启用后，如果多处引用相同对象，序列化结果将会不准确；如果出现循环引用，JSON.stringify 时将会出错
    forceInline?: boolean;

    /**
     * Outputs as CCON.
     * 
     * CCON denotes `Cocos Creator Object Notation`(let's imagine JSON as JavaScript Object Notation).
     * It allows binary representation of some value but loses the readability.
     * 
     * CCON can be represented as two formal:
     * - JSON + Binary file(s)
     * - Single Binary file
     * However `serialize()` produces whole `CCON` and you could select a suitable formal.
     * As Cocos Creator 3.3, the `useCCON` only be turned on
     * when it's going to serialize `AnimationClip` into library or into production.
     */
    useCCON?: boolean;
}