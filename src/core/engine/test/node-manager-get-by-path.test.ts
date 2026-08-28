import NodeManager from '../editor-extends/manager/node';
import pathManager from '../editor-extends/manager/node-path-manager';

describe('NodeManager 路径前导 / 归一化', () => {
    let manager: NodeManager;
    const sceneUuid = 'scene';
    const originalGetScene = (global as any).cc?.director?.getScene;

    beforeAll(() => {
        (global as any).cc = (global as any).cc || {};
        (global as any).cc.director = (global as any).cc.director || {};
        (global as any).cc.director.getScene = () => ({ uuid: sceneUuid });
    });

    afterAll(() => {
        if (originalGetScene) {
            (global as any).cc.director.getScene = originalGetScene;
        }
    });

    beforeEach(() => {
        manager = new NodeManager();
        manager.allow = true;
        pathManager.clear();
    });

    function addNode(uuid: string, name: string, parentUuid?: string) {
        const node = { uuid, name, _id: uuid, parent: parentUuid ? { uuid: parentUuid } : null } as any;
        manager.add(uuid, node);
        return node;
    }

    describe('getNodeByPath', () => {
        it('"/" 命中场景根', () => {
            expect(manager.getNodeByPath('/')?.uuid).toBe(sceneUuid);
        });

        it('"//" 多个前导 / 也命中场景根', () => {
            expect(manager.getNodeByPath('//')?.uuid).toBe(sceneUuid);
            expect(manager.getNodeByPath('///')?.uuid).toBe(sceneUuid);
        });

        it('空串返回 null，不误判为场景根', () => {
            expect(manager.getNodeByPath('')).toBeNull();
        });

        it('"Canvas" 与 "/Canvas" 命中同一节点', () => {
            const canvas = addNode('canvas', 'Canvas', sceneUuid);
            expect(manager.getNodeByPath('Canvas')).toBe(canvas);
            expect(manager.getNodeByPath('/Canvas')).toBe(canvas);
        });

        it('"//Canvas" 多前导 / 也命中', () => {
            const canvas = addNode('canvas', 'Canvas', sceneUuid);
            expect(manager.getNodeByPath('//Canvas')).toBe(canvas);
            expect(manager.getNodeByPath('///Canvas')).toBe(canvas);
        });

        it('多层子节点 "/Canvas/Node1" 命中', () => {
            addNode('canvas', 'Canvas', sceneUuid);
            const child = addNode('node1', 'Node1', 'canvas');
            expect(manager.getNodeByPath('Canvas/Node1')).toBe(child);
            expect(manager.getNodeByPath('/Canvas/Node1')).toBe(child);
        });

        it('三层 "/Canvas/Node1/Leaf" 命中', () => {
            addNode('canvas', 'Canvas', sceneUuid);
            addNode('node1', 'Node1', 'canvas');
            const leaf = addNode('leaf', 'Leaf', 'node1');
            expect(manager.getNodeByPath('/Canvas/Node1/Leaf')).toBe(leaf);
        });

        it('不存在路径带前导 / 也返回 null', () => {
            addNode('canvas', 'Canvas', sceneUuid);
            expect(manager.getNodeByPath('/Missing')).toBeNull();
            expect(manager.getNodeByPath('/Canvas/Missing')).toBeNull();
        });

        it('大小写不敏感命中 (带前导 /)', () => {
            const canvas = addNode('canvas', 'Canvas', sceneUuid);
            expect(manager.getNodeByPath('/canvas')).toBe(canvas);
            expect(manager.getNodeByPath('/CANVAS')).toBe(canvas);
        });

        it('大小写歧义时带前导 / 也抛出', () => {
            addNode('a', 'Foo', sceneUuid);
            addNode('b', 'foo', sceneUuid);
            expect(() => manager.getNodeByPath('/FOO')).toThrow(/ambiguous/i);
            expect(() => manager.getNodeByPath('FOO')).toThrow(/ambiguous/i);
        });
    });

    describe('getNodeUuidByPath', () => {
        it('"/" 命中场景 uuid', () => {
            expect(manager.getNodeUuidByPath('/')).toBe(sceneUuid);
        });

        it('多前导 / 命中场景 uuid', () => {
            expect(manager.getNodeUuidByPath('//')).toBe(sceneUuid);
        });

        it('"/Canvas" 命中子节点 uuid', () => {
            addNode('canvas', 'Canvas', sceneUuid);
            expect(manager.getNodeUuidByPath('Canvas')).toBe('canvas');
            expect(manager.getNodeUuidByPath('/Canvas')).toBe('canvas');
        });

        it('"/Canvas/Node1" 命中孙节点 uuid', () => {
            addNode('canvas', 'Canvas', sceneUuid);
            addNode('node1', 'Node1', 'canvas');
            expect(manager.getNodeUuidByPath('/Canvas/Node1')).toBe('node1');
        });

        it('不存在返回 null', () => {
            expect(manager.getNodeUuidByPath('/Missing')).toBeNull();
        });
    });
});
