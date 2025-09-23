import 'reflect-metadata';
import { z } from 'zod';
import { Tool, Description, Title, Param, Result, toolRegistry, ToolMetaData } from '../decorator/decorator';
import { createCommonResult, HttpStatusCodeSchema } from '../base/scheme-base';

// 禁用装饰器类型检查以避免测试中的类型错误
/* eslint-disable @typescript-eslint/ban-ts-comment */

describe('Decorator Module', () => {
    beforeEach(() => {
        // 清理注册表
        toolRegistry.clear();
    });

    describe('Tool decorator', () => {
        test('should register tool with basic metadata', () => {
            class TestApi {
                @Tool('testTool')
                testMethod() {
                    return 'test';
                }
            }

            expect(toolRegistry.has('testTool')).toBe(true);
            const toolInfo = toolRegistry.get('testTool');
            expect(toolInfo).toBeDefined();
            expect(toolInfo!.meta.toolName).toBe('testTool');
            expect(toolInfo!.meta.methodName).toBe('testMethod');
            expect(toolInfo!.meta.paramSchemas).toEqual([]);
            expect(toolInfo!.meta.title).toBeUndefined();
            expect(toolInfo!.meta.description).toBeUndefined();
            expect(toolInfo!.meta.returnSchema).toBeUndefined();
        });

        test('should throw error when registering duplicate tool name', () => {
            class TestApi1 {
                @Tool('duplicateTool')
                method1() { }
            }

            expect(() => {
                class TestApi2 {
                    @Tool('duplicateTool')
                    method2() { }
                }
            }).toThrow('Tool name "duplicateTool" is already registered');
        });

        test('should collect metadata from other decorators', () => {
            const testSchema = z.string();
            const expectedWrappedSchema = createCommonResult(testSchema);

            class TestApi {
                @Tool('complexTool')
                @Title('Test Title')
                @Description('Test Description')
                @Result(testSchema)
                testMethod() {
                    return 'test';
                }
            }

            const toolInfo = toolRegistry.get('complexTool');
            expect(toolInfo).toBeDefined();
            expect(toolInfo!.meta.title).toBe('Test Title');
            expect(toolInfo!.meta.description).toBe('Test Description');
            // 验证 schema 的结构而不是直接比较对象
            expect(toolInfo!.meta.returnSchema).toBeDefined();
            // 测试 schema 能正确解析预期的数据结构
            const testData = { code: 200, data: 'test' };
            expect(() => toolInfo!.meta.returnSchema!.parse(testData)).not.toThrow();
        });
    });

    describe('Title decorator', () => {
        test('should set title metadata', () => {
            class TestApi {

                @Tool('titleTool')

                @Title('My Tool Title')
                testMethod() { }
            }

            // Instantiate the class to trigger decorators
            new TestApi();

            const toolInfo = toolRegistry.get('titleTool');
            expect(toolInfo!.meta.title).toBe('My Tool Title');
        });

        test('should work with multiple methods', () => {
            class TestApi {

                @Tool('tool1')
                @Title('First Title')
                method1() { }
                @Tool('tool2')
                @Title('Second Title')
                method2() { }
            }

            // Instantiate the class to trigger decorators
            new TestApi();

            expect(toolRegistry.get('tool1')!.meta.title).toBe('First Title');
            expect(toolRegistry.get('tool2')!.meta.title).toBe('Second Title');
        });
    });

    describe('Description decorator', () => {
        test('should set description metadata', () => {
            class TestApi {

                @Tool('descTool')

                @Description('This is a test tool')
                testMethod() { }
            }

            // Instantiate the class to trigger decorators
            new TestApi();

            const toolInfo = toolRegistry.get('descTool');
            expect(toolInfo!.meta.description).toBe('This is a test tool');
        });

        test('should work with long descriptions', () => {
            const longDesc = 'This is a very long description that explains what this tool does in great detail and provides comprehensive information about its functionality.';

            class TestApi {

                @Tool('longDescTool')

                @Description(longDesc)
                testMethod() { }
            }

            // Instantiate the class to trigger decorators
            new TestApi();

            const toolInfo = toolRegistry.get('longDescTool');
            expect(toolInfo!.meta.description).toBe(longDesc);
        });
    });

    describe('Param decorator', () => {
        test('should collect parameter schemas', () => {
            const stringSchema = z.string();
            const numberSchema = z.number();

            class TestApi {

                @Tool('paramTool')
                testMethod(

                    @Param(stringSchema) param1: string,

                    @Param(numberSchema) param2: number
                ) { }
            }

            const toolInfo = toolRegistry.get('paramTool');
            expect(toolInfo!.meta.paramSchemas).toHaveLength(2);

            const param1Schema = toolInfo!.meta.paramSchemas.find(p => p.index === 0);
            const param2Schema = toolInfo!.meta.paramSchemas.find(p => p.index === 1);

            expect(param1Schema).toBeDefined();
            expect(param1Schema!.schema).toBe(stringSchema);
            expect(param2Schema).toBeDefined();
            expect(param2Schema!.schema).toBe(numberSchema);
        });

        test('should handle single parameter', () => {
            const booleanSchema = z.boolean();

            class TestApi {

                @Tool('singleParamTool')
                testMethod(

                    @Param(booleanSchema) param: boolean
                ) { }
            }

            const toolInfo = toolRegistry.get('singleParamTool');
            expect(toolInfo!.meta.paramSchemas).toHaveLength(1);
            expect(toolInfo!.meta.paramSchemas[0].index).toBe(0);
            expect(toolInfo!.meta.paramSchemas[0].schema).toBe(booleanSchema);
        });

        test('should handle complex parameter schemas', () => {
            const objectSchema = z.object({
                name: z.string(),
                age: z.number(),
            });

            class TestApi {

                @Tool('complexParamTool')
                testMethod(
                    @Param(objectSchema) user: any
                ) { }
            }

            const toolInfo = toolRegistry.get('complexParamTool');
            expect(toolInfo!.meta.paramSchemas[0].schema).toBe(objectSchema);
        });
    });

    describe('Result decorator', () => {
        test('should set return schema using createCommonResult', () => {
            const dataSchema = z.string();
            const expectedWrappedSchema = createCommonResult(dataSchema);

            class TestApi {

                @Tool('resultTool')

                @Result(dataSchema)
                testMethod() { }
            }

            const toolInfo = toolRegistry.get('resultTool');
            // 验证 schema 的结构而不是直接比较对象
            expect(toolInfo!.meta.returnSchema).toBeDefined();
            // 测试 schema 能正确解析预期的数据结构
            const testData = { code: 200, data: 'test' };
            expect(() => toolInfo!.meta.returnSchema!.parse(testData)).not.toThrow();
        });

        test('should work with complex return schemas', () => {
            const complexSchema = z.object({
                users: z.array(z.object({
                    id: z.number(),
                    name: z.string(),
                })),
                total: z.number(),
            });
            const expectedWrappedSchema = createCommonResult(complexSchema);

            class TestApi {

                @Tool('complexResultTool')

                @Result(complexSchema)
                testMethod() { }
            }

            const toolInfo = toolRegistry.get('complexResultTool');
            // 验证 schema 的结构而不是直接比较对象
            expect(toolInfo!.meta.returnSchema).toBeDefined();
            // 测试 schema 能正确解析预期的数据结构
            const testData = { code: 200, data: { users: [{ id: 1, name: 'test' }], total: 1 } };
            expect(() => toolInfo!.meta.returnSchema!.parse(testData)).not.toThrow();
        });
    });

    describe('Combined decorators', () => {
        test('should work with all decorators together', () => {
            const paramSchema = z.string();
            const returnSchema = z.number();
            const expectedWrappedSchema = createCommonResult(returnSchema);

            class TestApi {

                @Tool('fullTool')

                @Title('Full Featured Tool')

                @Description('A tool that demonstrates all decorators')

                @Result(returnSchema)
                testMethod(

                    @Param(paramSchema) input: string
                ) { }
            }

            const toolInfo = toolRegistry.get('fullTool');
            expect(toolInfo).toBeDefined();
            expect(toolInfo!.meta.toolName).toBe('fullTool');
            expect(toolInfo!.meta.methodName).toBe('testMethod');
            expect(toolInfo!.meta.title).toBe('Full Featured Tool');
            expect(toolInfo!.meta.description).toBe('A tool that demonstrates all decorators');
            // 验证 schema 的结构而不是直接比较对象
            expect(toolInfo!.meta.returnSchema).toBeDefined();
            // 测试 schema 能正确解析预期的数据结构
            const testData = { code: 200, data: 42 };
            expect(() => toolInfo!.meta.returnSchema!.parse(testData)).not.toThrow();
            expect(toolInfo!.meta.paramSchemas).toHaveLength(1);
            expect(toolInfo!.meta.paramSchemas[0].schema).toBe(paramSchema);
        });

        test('should handle multiple tools in same class', () => {
            const schema1 = z.string();
            const schema2 = z.number();
            const expectedWrappedSchema1 = createCommonResult(schema1);
            const expectedWrappedSchema2 = createCommonResult(schema2);

            class TestApi {

                @Tool('tool1')

                @Title('First Tool')

                @Result(schema1)
                method1() { }


                @Tool('tool2')

                @Title('Second Tool')

                @Result(schema2)
                method2() { }
            }

            expect(toolRegistry.size).toBe(2);

            const tool1Info = toolRegistry.get('tool1');
            const tool2Info = toolRegistry.get('tool2');

            expect(tool1Info!.meta.title).toBe('First Tool');
            expect(tool1Info!.meta.methodName).toBe('method1');
            // 验证第一个工具的 schema
            expect(tool1Info!.meta.returnSchema).toBeDefined();
            const testData1 = { code: 200, data: 'test' };
            expect(() => tool1Info!.meta.returnSchema!.parse(testData1)).not.toThrow();

            expect(tool2Info!.meta.title).toBe('Second Tool');
            expect(tool2Info!.meta.methodName).toBe('method2');
            // 验证第二个工具的 schema
            expect(tool2Info!.meta.returnSchema).toBeDefined();
            const testData2 = { code: 200, data: 42 };
            expect(() => tool2Info!.meta.returnSchema!.parse(testData2)).not.toThrow();
        });
    });

    describe('toolRegistry', () => {
        test('should be initially empty', () => {
            expect(toolRegistry.size).toBe(0);
        });

        test('should store tool metadata correctly', () => {
            class TestApi {

                @Tool('registryTest')
                testMethod() { }
            }

            expect(toolRegistry.size).toBe(1);
            expect(toolRegistry.has('registryTest')).toBe(true);

            const toolInfo = toolRegistry.get('registryTest');
            expect(toolInfo).toBeDefined();
            expect(toolInfo!.target).toBe(TestApi.prototype);
            expect(toolInfo!.meta).toBeDefined();
        });

        test('should be clearable', () => {
            class TestApi {

                @Tool('clearTest')
                testMethod() { }
            }

            expect(toolRegistry.size).toBe(1);
            toolRegistry.clear();
            expect(toolRegistry.size).toBe(0);
            expect(toolRegistry.has('clearTest')).toBe(false);
        });

        test('should handle multiple registrations', () => {
            class TestApi1 {

                @Tool('tool1')
                method1() { }
            }

            class TestApi2 {

                @Tool('tool2')
                method2() { }
            }

            expect(toolRegistry.size).toBe(2);
            expect(toolRegistry.has('tool1')).toBe(true);
            expect(toolRegistry.has('tool2')).toBe(true);
        });
    });

    describe('ToolMetaData interface', () => {
        test('should have correct structure', () => {
            const paramSchema = z.string();
            const returnSchema = z.boolean();

            class TestApi {

                @Tool('metadataTest')

                @Title('Test Title')

                @Description('Test Description')

                @Result(returnSchema)
                testMethod(

                    @Param(paramSchema) param: string
                ) { }
            }

            const toolInfo = toolRegistry.get('metadataTest');
            const meta = toolInfo!.meta;

            // 验证 ToolMetaData 接口的所有属性
            expect(typeof meta.toolName).toBe('string');
            expect(typeof meta.methodName).toBe('string');
            expect(typeof meta.title).toBe('string');
            expect(typeof meta.description).toBe('string');
            expect(Array.isArray(meta.paramSchemas)).toBe(true);
            expect(meta.returnSchema).toBeDefined();

            // 验证 paramSchemas 的结构
            expect(meta.paramSchemas[0]).toHaveProperty('index');
            expect(meta.paramSchemas[0]).toHaveProperty('schema');
            expect(typeof meta.paramSchemas[0].index).toBe('number');
        });
    });

    describe('Edge cases', () => {
        test('should handle empty tool name', () => {
            expect(() => {
                class TestApi {

                    @Tool('')
                    testMethod() { }
                }
            }).not.toThrow();

            // 空字符串会被替换为方法名
            expect(toolRegistry.has('testMethod')).toBe(true);
        });

        test('should handle special characters in tool name', () => {
            const specialName = 'tool-with_special.chars@123';

            class TestApi {

                @Tool(specialName)
                testMethod() { }
            }

            expect(toolRegistry.has(specialName)).toBe(true);
        });

        test('should handle methods without parameters', () => {
            class TestApi {

                @Tool('noParamTool')
                testMethod() { }
            }

            const toolInfo = toolRegistry.get('noParamTool');
            expect(toolInfo!.meta.paramSchemas).toEqual([]);
        });

        test('should handle decorators applied in different orders', () => {
            const returnSchema = z.number();
            const expectedWrappedSchema = createCommonResult(returnSchema);

            class TestApi {

                @Tool('orderTest')

                @Description('Description first')

                @Title('Title last')

                @Result(returnSchema)
                testMethod() { }
            }

            // Instantiate the class to trigger decorators
            new TestApi();

            const toolInfo = toolRegistry.get('orderTest');
            expect(toolInfo!.meta.title).toBe('Title last');
            expect(toolInfo!.meta.description).toBe('Description first');
            // 验证 schema 的结构而不是直接比较对象
            expect(toolInfo!.meta.returnSchema).toBeDefined();
            const testData = { code: 200, data: 42 };
            expect(() => toolInfo!.meta.returnSchema!.parse(testData)).not.toThrow();
        });
    });
});