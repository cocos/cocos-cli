import {
    getByDotPath,
    setByDotPath,
    isValidConfigKey,
    isValidConfigValue,
    deepMerge,
    isEmptyObject,
    safeGet,
    safeSet
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
    });

    describe('isEmptyObject', () => {
        test('应该识别空对象', () => {
            expect(isEmptyObject({})).toBe(true);
            expect(isEmptyObject(null)).toBe(true);
            expect(isEmptyObject(undefined)).toBe(true);
        });

        test('应该识别非空对象', () => {
            expect(isEmptyObject({ a: 1 })).toBe(false);
            expect(isEmptyObject([])).toBe(false);
        });

        test('应该识别非对象类型', () => {
            expect(isEmptyObject('string')).toBe(true);
            expect(isEmptyObject(123)).toBe(true);
            expect(isEmptyObject(true)).toBe(true);
        });
    });

    describe('safeGet', () => {
        const testObj = { a: { b: { c: 3 } } };

        test('应该安全获取值', () => {
            expect(safeGet(testObj, 'a.b.c')).toBe(3);
            expect(safeGet(testObj, 'a.b.nonExistent', 'default')).toBe('default');
        });

        test('应该使用默认值', () => {
            expect(safeGet(testObj, 'nonExistent', 'default')).toBe('default');
            expect(safeGet(null, 'a.b.c', 'default')).toBe('default');
        });
    });

    describe('safeSet', () => {
        test('应该安全设置值', () => {
            const obj: any = {};
            expect(safeSet(obj, 'a.b.c', 3)).toBe(true);
            expect(obj.a.b.c).toBe(3);
        });

        test('应该处理错误情况', () => {
            expect(safeSet(null, 'a.b.c', 3)).toBe(false);
            expect(safeSet({}, '', 3)).toBe(false);
        });
    });
});
