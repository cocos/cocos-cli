import {
    getByDotPath,
    setByDotPath,
    isValidConfigKey,
    isValidConfigValue,
    deepMerge
} from '../script/utils';

describe('Configuration Utils', () => {
    describe('getByDotPath', () => {
        const testObj = {
            a: {
                b: {
                    c: 3,
                    d: null,
                    e: undefined
                }
            },
            f: 'simple'
        };

        test('应该获取嵌套值', () => {
            expect(getByDotPath(testObj, 'a.b.c')).toBe(3);
            expect(getByDotPath(testObj, 'f')).toBe('simple');
        });

        test('应该返回 null 值', () => {
            expect(getByDotPath(testObj, 'a.b.d')).toBeNull();
        });

        test('应该返回 undefined 值', () => {
            expect(getByDotPath(testObj, 'a.b.e')).toBeUndefined();
        });

        test('应该返回 undefined 对于不存在的路径', () => {
            expect(getByDotPath(testObj, 'a.b.nonExistent')).toBeUndefined();
            expect(getByDotPath(testObj, 'nonExistent')).toBeUndefined();
        });

        test('应该处理空输入', () => {
            expect(getByDotPath(null, 'a.b.c')).toBeUndefined();
            expect(getByDotPath(testObj, '')).toBeUndefined();
        });
    });

    describe('setByDotPath', () => {
        test('应该设置嵌套值', () => {
            const obj: any = {};
            setByDotPath(obj, 'a.b.c', 3);
            expect(obj.a.b.c).toBe(3);
        });

        test('应该覆盖现有值', () => {
            const obj: any = { a: { b: { c: 1 } } };
            setByDotPath(obj, 'a.b.c', 2);
            expect(obj.a.b.c).toBe(2);
        });

        test('应该处理空输入', () => {
            const obj: any = {};
            setByDotPath(obj, '', 'value');
            setByDotPath(null, 'a.b.c', 'value');
            // 应该不会抛出错误
        });
    });

    describe('isValidConfigKey', () => {
        test('应该验证有效键名', () => {
            expect(isValidConfigKey('validKey')).toBe(true);
            expect(isValidConfigKey('valid.key')).toBe(true);
            expect(isValidConfigKey('valid-key')).toBe(true);
        });

        test('应该拒绝无效键名', () => {
            expect(isValidConfigKey('')).toBe(false);
            expect(isValidConfigKey('   ')).toBe(false);
            expect(isValidConfigKey(null as any)).toBe(false);
            expect(isValidConfigKey(undefined as any)).toBe(false);
        });
    });

    describe('isValidConfigValue', () => {
        test('应该验证有效对象值', () => {
            expect(isValidConfigValue({})).toBe(true);
            expect(isValidConfigValue({ a: 1 })).toBe(true);
            expect(isValidConfigValue({ a: { b: 2 } })).toBe(true);
        });

        test('应该拒绝无效值', () => {
            expect(isValidConfigValue(null)).toBe(false);
            expect(isValidConfigValue([])).toBe(false);
            expect(isValidConfigValue('string')).toBe(false);
            expect(isValidConfigValue(123)).toBe(false);
            expect(isValidConfigValue(true)).toBe(false);
        });
    });

    describe('deepMerge', () => {
        test('应该深度合并对象', () => {
            const target = { a: 1, b: { c: 2 } };
            const source = { b: { d: 3 }, e: 4 };
            const result = deepMerge(target, source);
            
            expect(result).toEqual({
                a: 1,
                b: { c: 2, d: 3 },
                e: 4
            });
        });

        test('应该覆盖非对象值', () => {
            const target = { a: 1, b: 2 };
            const source = { a: 3, b: { c: 4 } };
            const result = deepMerge(target, source);
            
            expect(result).toEqual({
                a: 3,
                b: { c: 4 }
            });
        });

        test('应该处理基本类型值', () => {
            expect(deepMerge(123, 456)).toBe(456);
            expect(deepMerge('hello', 'world')).toBe('world');
            expect(deepMerge(true, false)).toBe(false);
            expect(deepMerge(123, 'string')).toBe('string');
        });

        test('应该处理数组', () => {
            expect(deepMerge([1, 2], [3, 4])).toEqual([3, 4]);
            expect(deepMerge({ a: 1 }, [1, 2, 3])).toEqual([1, 2, 3]);
            expect(deepMerge([1, 2], { b: 2 })).toEqual({ b: 2 });
        });

        test('应该处理 null 和 undefined', () => {
            expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
            expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
            expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
            expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
            // 当 source 为 null/undefined 时，返回 target
            expect(deepMerge(null, undefined)).toBe(null);
            expect(deepMerge(undefined, null)).toBe(undefined);
        });

        test('应该处理复杂嵌套对象', () => {
            const target = {
                a: 1,
                b: {
                    c: 2,
                    d: {
                        e: 3,
                        f: 4
                    }
                },
                g: 'target'
            };
            const source = {
                b: {
                    d: {
                        f: 5,
                        h: 6
                    },
                    i: 7
                },
                j: 'source'
            };
            const result = deepMerge(target, source);
            
            expect(result).toEqual({
                a: 1,
                b: {
                    c: 2,
                    d: {
                        e: 3,
                        f: 5,
                        h: 6
                    },
                    i: 7
                },
                g: 'target',
                j: 'source'
            });
        });

        test('应该处理混合类型覆盖', () => {
            expect(deepMerge({ a: 1 }, 123)).toBe(123);
            expect(deepMerge(123, { a: 1 })).toEqual({ a: 1 });
            expect(deepMerge('string', [1, 2, 3])).toEqual([1, 2, 3]);
            expect(deepMerge([1, 2], 'string')).toBe('string');
        });

        test('应该处理空对象', () => {
            expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
            expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
            expect(deepMerge({}, {})).toEqual({});
        });
    });

});
