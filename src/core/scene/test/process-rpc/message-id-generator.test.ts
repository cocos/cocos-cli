import { MessageIdGenerator } from '../../process-rpc/message-id-generator';

/**
 * MessageIdGenerator 单元测试
 * 测试消息 ID 生成器的核心功能
 */

describe('MessageIdGenerator', () => {
    describe('基本功能', () => {
        test('应该生成递增的 ID', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            const id1 = generator.generate();
            const id2 = generator.generate();
            const id3 = generator.generate();
            
            expect(id2).toBe(id1 + 1);
            expect(id3).toBe(id2 + 1);
        });

        test('应该从 1 开始生成 ID', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            const id = generator.generate();
            expect(id).toBe(1);
        });

        test('应该能重置 ID 计数器', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            generator.generate();
            generator.generate();
            generator.generate();
            
            generator.reset();
            
            const id = generator.generate();
            expect(id).toBe(1);
        });
    });

    describe('ID 冲突检测', () => {
        test('检测到冲突时应跳过该 ID', () => {
            const usedIds = new Set([2, 3]);
            const hasId = jest.fn((id: number) => usedIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            const id1 = generator.generate(); // 1
            const id2 = generator.generate(); // 跳过 2，返回 4
            const id3 = generator.generate(); // 5
            
            expect(id1).toBe(1);
            expect(id2).toBe(4);
            expect(id3).toBe(5);
        });

        test('应该能处理连续的冲突', () => {
            const usedIds = new Set([2, 3, 4, 5]);
            const hasId = jest.fn((id: number) => usedIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            const id1 = generator.generate(); // 1
            const id2 = generator.generate(); // 跳过 2-5，返回 6
            
            expect(id1).toBe(1);
            expect(id2).toBe(6);
        });

        test('达到最大重试次数应抛出错误', () => {
            // 所有 ID 都被占用
            const hasId = jest.fn().mockReturnValue(true);
            const generator = new MessageIdGenerator(hasId);
            
            expect(() => {
                generator.generate();
            }).toThrow(/Unable to generate unique message ID/);
        });

        test('冲突检测应该在有限次数内完成', () => {
            let callCount = 0;
            const hasId = jest.fn((id: number) => {
                callCount++;
                return id < 500; // 前 500 个 ID 都被占用
            });
            
            const generator = new MessageIdGenerator(hasId);
            
            const id = generator.generate();
            
            expect(id).toBe(500);
            expect(callCount).toBeLessThan(1000); // 应该在 1000 次尝试内完成
        });
    });

    describe('ID 循环', () => {
        test('达到最大值后应循环到 1', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            // 设置 ID 接近最大值
            (generator as any).msgId = Number.MAX_SAFE_INTEGER - 2;
            
            const id1 = generator.generate();
            expect(id1).toBe(Number.MAX_SAFE_INTEGER - 1);
            
            const id2 = generator.generate();
            expect(id2).toBe(1); // 应该循环到 1
        });

        test('循环后应继续检测冲突', () => {
            const usedIds = new Set([1, 2, 3]);
            const hasId = jest.fn((id: number) => usedIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            // 设置 ID 接近最大值
            (generator as any).msgId = Number.MAX_SAFE_INTEGER - 1;
            
            const id = generator.generate(); // 循环后跳过 1-3，返回 4
            expect(id).toBe(4);
        });

        test('循环一圈后所有 ID 都被占用应抛出错误', () => {
            let firstId: number | null = null;
            const hasId = jest.fn((id: number) => {
                if (firstId === null) {
                    firstId = id;
                    return false; // 第一次返回 false，让它记录起始 ID
                }
                return true; // 之后都返回 true，模拟所有 ID 都被占用
            });
            
            const generator = new MessageIdGenerator(hasId);
            
            // 第一次成功
            const id1 = generator.generate();
            expect(id1).toBeGreaterThan(0);
            
            // 第二次应该失败（所有 ID 都被占用）
            expect(() => {
                generator.generate();
            }).toThrow(/Unable to generate unique message ID|All message IDs are in use/);
        });
    });

    describe('高并发场景', () => {
        test('应该能生成大量唯一 ID', () => {
            const usedIds = new Set<number>();
            const hasId = jest.fn((id: number) => usedIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            const ids: number[] = [];
            for (let i = 0; i < 1000; i++) {
                const id = generator.generate();
                ids.push(id);
                usedIds.add(id);
            }
            
            // 验证所有 ID 都是唯一的
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(1000);
        });

        test('在有冲突的情况下应该能生成大量 ID', () => {
            const usedIds = new Set<number>();
            
            // 预先占用一些 ID
            for (let i = 10; i < 20; i++) {
                usedIds.add(i);
            }
            for (let i = 50; i < 100; i++) {
                usedIds.add(i);
            }
            
            const hasId = jest.fn((id: number) => usedIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            const ids: number[] = [];
            for (let i = 0; i < 200; i++) {
                const id = generator.generate();
                ids.push(id);
                usedIds.add(id);
            }
            
            // 验证所有 ID 都是唯一的
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(200);
            
            // 验证跳过了被占用的 ID
            ids.forEach(id => {
                expect(id < 10 || id >= 20).toBeTruthy();
            });
        });

        test('快速生成和释放 ID 应该稳定', () => {
            const activeIds = new Set<number>();
            const hasId = jest.fn((id: number) => activeIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            // 模拟快速生成和释放 ID
            for (let i = 0; i < 500; i++) {
                const id = generator.generate();
                activeIds.add(id);
                
                // 随机释放一些 ID
                if (i % 3 === 0 && activeIds.size > 10) {
                    const idsArray = Array.from(activeIds);
                    const toRemove = idsArray[Math.floor(Math.random() * idsArray.length)];
                    activeIds.delete(toRemove);
                }
            }
            
            // 应该没有抛出错误
            expect(activeIds.size).toBeGreaterThan(0);
        });
    });

    describe('边界情况', () => {
        test('hasId 函数抛出错误应该传播', () => {
            const hasId = jest.fn().mockImplementation(() => {
                throw new Error('hasId error');
            });
            const generator = new MessageIdGenerator(hasId);
            
            expect(() => {
                generator.generate();
            }).toThrow('hasId error');
        });

        test('重置后应该能正常生成 ID', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            // 生成一些 ID
            generator.generate();
            generator.generate();
            generator.generate();
            
            // 重置
            generator.reset();
            
            // 应该从 1 开始
            const id = generator.generate();
            expect(id).toBe(1);
        });

        test('多次重置应该安全', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            generator.reset();
            generator.reset();
            generator.reset();
            
            const id = generator.generate();
            expect(id).toBe(1);
        });

        test('ID 应该是正整数', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            for (let i = 0; i < 100; i++) {
                const id = generator.generate();
                expect(id).toBeGreaterThan(0);
                expect(Number.isInteger(id)).toBe(true);
            }
        });

        test('在接近最大值时应该正确处理', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            // 设置为最大值
            (generator as any).msgId = Number.MAX_SAFE_INTEGER;
            
            // 应该循环到 1
            const id = generator.generate();
            expect(id).toBe(1);
        });
    });

    describe('性能', () => {
        test('生成 10000 个 ID 应该很快', () => {
            const hasId = jest.fn().mockReturnValue(false);
            const generator = new MessageIdGenerator(hasId);
            
            const startTime = Date.now();
            
            for (let i = 0; i < 10000; i++) {
                generator.generate();
            }
            
            const duration = Date.now() - startTime;
            
            // 应该在 100ms 内完成
            expect(duration).toBeLessThan(100);
        });

        test('有冲突时生成 1000 个 ID 应该在合理时间内完成', () => {
            const usedIds = new Set<number>();
            
            // 随机占用 20% 的 ID
            for (let i = 0; i < 2000; i++) {
                if (Math.random() < 0.2) {
                    usedIds.add(i);
                }
            }
            
            const hasId = jest.fn((id: number) => usedIds.has(id));
            const generator = new MessageIdGenerator(hasId);
            
            const startTime = Date.now();
            
            for (let i = 0; i < 1000; i++) {
                const id = generator.generate();
                usedIds.add(id);
            }
            
            const duration = Date.now() - startTime;
            
            // 即使有冲突，也应该在 500ms 内完成
            expect(duration).toBeLessThan(500);
        });
    });
});

