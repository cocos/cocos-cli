import {
    IProperty,
} from '../../../../@types/public';

export interface DumpInterface {
    /**
     * 编码一个对象。
     * 
     * @param object 正在编码的对象。
     * 
     * 注意 `object` 可能是空的，比如，对于任何类 `B`，
     * 在编码某个对象的 `b: B` 属性时，
     * ```ts
     * class A {
     *   \@property(B)
     *   b = null; // 
     * }
     * ```
     * 如果是 `b` 属性是 `null`，那么这里收到的 `object` 也会是 `null`。
     * 
     * @param data 不知道作用，问思捷。
     * @param opts 不知道作用，问思捷。
     */
    encode(object: any, data: IProperty, opts?: any): void;
    decode(data: any, info: any, dump: any, opts?: any): void;
}
