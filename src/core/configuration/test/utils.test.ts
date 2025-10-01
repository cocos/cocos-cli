import * as utils from '../script/utils';

describe('Configuration Utils', () => {
    const testObject = {
        level1: {
            level2: {
                level3: 'value3',
                array: [1, 2, 3],
                nullValue: null,
                undefinedValue: undefined
            },
            simple: 'value1'
        },
        topLevel: 'top'
    };

    describe('getByDotPath', () => {
        it('should get values by dot path', () => {
            expect(utils.getByDotPath(testObject, 'level1.level2.level3')).toBe('value3');
            expect(utils.getByDotPath(testObject, 'level1.simple')).toBe('value1');
            expect(utils.getByDotPath(testObject, 'topLevel')).toBe('top');
            expect(utils.getByDotPath(testObject, 'level1.level2.array')).toEqual([1, 2, 3]);
        });

        it('should return undefined for non-existent paths', () => {
            expect(utils.getByDotPath(testObject, 'non.existent.path')).toBeUndefined();
            expect(utils.getByDotPath(testObject, 'level1.non.existent')).toBeUndefined();
        });

        it('should handle null/undefined values and invalid inputs', () => {
            expect(utils.getByDotPath(testObject, 'level1.level2.nullValue')).toBeNull();
            expect(utils.getByDotPath(testObject, 'level1.level2.undefinedValue')).toBeUndefined();
            expect(utils.getByDotPath(null, 'level1')).toBeUndefined();
            expect(utils.getByDotPath(testObject, '')).toBeUndefined();
        });
    });

    describe('setByDotPath', () => {
        it('should set values by dot path', () => {
            const target = {};
            utils.setByDotPath(target, 'level1.level2.level3', 'newValue');
            expect(target).toEqual({
                level1: { level2: { level3: 'newValue' } }
            });

            utils.setByDotPath(target, 'topLevel', 'topValue');
            expect(target).toEqual({
                level1: { level2: { level3: 'newValue' } },
                topLevel: 'topValue'
            });
        });

        it('should overwrite existing values and create nested structures', () => {
            const target = { existing: 'value' };
            utils.setByDotPath(target, 'existing', 'updated');
            utils.setByDotPath(target, 'new.nested.path', 'value');
            expect(target).toEqual({
                existing: 'updated',
                new: { nested: { path: 'value' } }
            });
        });

        it('should handle null/undefined values and invalid inputs', () => {
            const target = { existing: 'value' };
            utils.setByDotPath(target, 'nullValue', null);
            utils.setByDotPath(target, 'undefinedValue', undefined);
            expect(target).toEqual({
                existing: 'value',
                nullValue: null,
                undefinedValue: undefined
            });

            // Invalid inputs should not modify target
            const originalTarget = JSON.parse(JSON.stringify(target));
            utils.setByDotPath(null, 'path', 'value');
            utils.setByDotPath(target, '', 'value');
            expect(target).toEqual(originalTarget);
        });
    });

    describe('removeByDotPath', () => {
        it('should remove values by dot path', () => {
            const target = {
                level1: { level2: { level3: 'value3', keep: 'keepValue' } },
                topLevel: 'value'
            };
            
            expect(utils.removeByDotPath(target, 'level1.level2.level3')).toBe(true);
            expect(target).toEqual({
                level1: { level2: { keep: 'keepValue' } },
                topLevel: 'value'
            });

            expect(utils.removeByDotPath(target, 'topLevel')).toBe(true);
            expect(target).toEqual({
                level1: { level2: { keep: 'keepValue' } }
            });
        });

        it('should return false for non-existent paths and invalid inputs', () => {
            const target = { level1: { level2: 'value' } };
            expect(utils.removeByDotPath(target, 'level1.non.existent')).toBe(false);
            expect(utils.removeByDotPath(null, 'path')).toBe(false);
            expect(utils.removeByDotPath({}, '')).toBe(false);
            expect(utils.removeByDotPath({ level1: 'string' }, 'level1.nested')).toBe(false);
        });
    });

    describe('isValidConfigKey', () => {
        it('should validate config keys', () => {
            expect(utils.isValidConfigKey('validKey')).toBe(true);
            expect(utils.isValidConfigKey('nested.key')).toBe(true);
            expect(utils.isValidConfigKey('key-with-dash')).toBe(true);
            expect(utils.isValidConfigKey('key_with_underscore')).toBe(true);
            expect(utils.isValidConfigKey('123key')).toBe(true);
            
            expect(utils.isValidConfigKey('')).toBe(false);
            expect(utils.isValidConfigKey('   ')).toBe(false);
            expect(utils.isValidConfigKey(null as any)).toBe(false);
            expect(utils.isValidConfigKey(undefined as any)).toBe(false);
            expect(utils.isValidConfigKey(123 as any)).toBe(false);
        });
    });

    describe('deepMerge', () => {
        it('should merge objects deeply', () => {
            const target = {
                level1: { level2: { value1: 'original', value2: 'original' }, value3: 'original' },
                topLevel: 'original'
            };
            const source = {
                level1: { level2: { value1: 'updated', value4: 'new' }, value5: 'new' },
                topLevel2: 'new'
            };

            const result = utils.deepMerge(target, source);
            expect(result).toEqual({
                level1: {
                    level2: { value1: 'updated', value2: 'original', value4: 'new' },
                    value3: 'original',
                    value5: 'new'
                },
                topLevel: 'original',
                topLevel2: 'new'
            });
        });

        it('should handle null/undefined and primitive values', () => {
            const source = { key: 'value' };
            const target = { key: 'value' };
            
            expect(utils.deepMerge(null, source)).toEqual(source);
            expect(utils.deepMerge(target, null)).toEqual(target);
            expect(utils.deepMerge('string', { key: 'value' })).toEqual({ key: 'value' });
            expect(utils.deepMerge({ key: 'value' }, 'string')).toBe('string');
        });

        it('should handle arrays and not modify original objects', () => {
            const target = { array: [1, 2, 3] };
            const source = { array: [4, 5, 6] };
            const result = utils.deepMerge(target, source);
            expect(result).toEqual({ array: [4, 5, 6] });

            // Should not modify original objects
            const originalTarget = JSON.parse(JSON.stringify(target));
            const originalSource = JSON.parse(JSON.stringify(source));
            utils.deepMerge(target, source);
            expect(target).toEqual(originalTarget);
            expect(source).toEqual(originalSource);
        });
    });
});
