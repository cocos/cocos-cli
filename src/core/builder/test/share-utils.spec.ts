

import { checkConfigDefault } from '../share/utils';
import { IBuilderConfigItem } from '../@types/protected';

describe('share/utils', () => {
    describe('checkConfigDefault', () => {
        it('should return default value if it exists', () => {
            const config: IBuilderConfigItem = {
                type: 'string',
                default: 'test',
            };
            expect(checkConfigDefault(config)).toBe('test');
        });

        it('should return null if config is null', () => {
            // @ts-ignore
            expect(checkConfigDefault(null)).toBeNull();
        });

        it('should handle object type with properties', () => {
            const config: IBuilderConfigItem = {
                type: 'object',
                properties: {
                    prop1: {
                        type: 'string',
                        default: 'value1',
                    },
                    prop2: {
                        type: 'number',
                        default: 123,
                    },
                },
            };
            const result = checkConfigDefault(config);
            expect(result).toEqual({
                prop1: 'value1',
                prop2: 123,
            });
        });

        it('should handle array type with single item config', () => {
            const config: IBuilderConfigItem = {
                type: 'array',
                items: {
                    type: 'string',
                    default: 'itemValue',
                },
                default: ['itemValue'], // Mocking default array as the function populates it
            };
            // Note: The current implementation of checkConfigDefault for arrays relies on config.default being an array to set values at indices.
            // However, if config.default is undefined, it initializes it to [].
            // But it iterates over 'items' which is a single config object in this case? 
            // Wait, the implementation:
            // if (config.type === 'array' && config.items) {
            //     config.default = [];
            //     const items = Array.isArray(config.items) ? config.items : [config.items];
            //     items.forEach((item, index) => {
            //         config.default[index] = checkConfigDefault(item as IBuilderConfigItem);
            //     });
            // }
            // If items is a single object, it becomes [item]. forEach runs once. index 0.
            // So it returns [defaultValueOfItem].
            
            const config2: IBuilderConfigItem = {
                type: 'array',
                items: {
                    type: 'string',
                    default: 'defaultItem',
                }
            };
            
            const result = checkConfigDefault(config2);
            expect(result).toEqual(['defaultItem']);
        });

        it('should handle array type with array of item configs', () => {
            const config: IBuilderConfigItem = {
                type: 'array',
                items: [
                    {
                        type: 'string',
                        default: 'item1',
                    },
                    {
                        type: 'number',
                        default: 456,
                    },
                ],
            };
            const result = checkConfigDefault(config);
            expect(result).toEqual(['item1', 456]);
        });

        it('should handle nested objects', () => {
            const config: IBuilderConfigItem = {
                type: 'object',
                properties: {
                    nested: {
                        type: 'object',
                        properties: {
                            inner: {
                                type: 'boolean',
                                default: true,
                            },
                        },
                    },
                },
            };
            const result = checkConfigDefault(config);
            expect(result).toEqual({
                nested: {
                    inner: true,
                },
            });
        });
    });
});
