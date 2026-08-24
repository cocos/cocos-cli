import ComponentManager from '../editor-extends/manager/component';

(globalThis as any).cc = { js: { getClassName: (comp: any) => comp._className ?? 'UnknownComponent' } };

jest.mock('../editor-extends/manager/node-path-manager', () => ({
    __esModule: true,
    default: { getNodePath: (uuid: string) => (uuid === 'scene' ? '' : uuid) },
    NodePathManager: class {},
}));

describe('ComponentManager 组件路径前导 / 归一化', () => {
    let manager: ComponentManager;

    beforeEach(() => {
        manager = new ComponentManager();
        manager.allow = true;
    });

    function addComponent(uuid: string, nodeUuid: string, className = 'cc.Label') {
        const comp = { uuid, _id: uuid, _className: className, node: { uuid: nodeUuid } } as any;
        manager.add(uuid, comp);
        return comp;
    }

    describe('_generateUniquePath 写入侧', () => {
        it('普通子节点上的组件路径不带前导 /', () => {
            addComponent('c1', 'Canvas', 'cc.Label');
            expect(manager.getPathFromUuid('c1')).toBe('Canvas/cc.Label');
        });

        it('深层节点上的组件路径不带前导 /', () => {
            addComponent('c1', 'Canvas/Node1', 'cc.Sprite');
            expect(manager.getPathFromUuid('c1')).toBe('Canvas/Node1/cc.Sprite');
        });

        it('同节点上重名组件按 _001/_002 递增，无前导 /', () => {
            addComponent('c1', 'Canvas', 'cc.Label');
            addComponent('c2', 'Canvas', 'cc.Label');
            addComponent('c3', 'Canvas', 'cc.Label');
            expect(manager.getPathFromUuid('c1')).toBe('Canvas/cc.Label');
            expect(manager.getPathFromUuid('c2')).toBe('Canvas/cc.Label_001');
            expect(manager.getPathFromUuid('c3')).toBe('Canvas/cc.Label_002');
        });
    });

    describe('getComponentFromPath 查询侧', () => {
        it('不带 / 与带前导 / 命中同一组件', () => {
            const c1 = addComponent('c1', 'Canvas', 'cc.Label');
            expect(manager.getComponentFromPath('Canvas/cc.Label')).toBe(c1);
            expect(manager.getComponentFromPath('/Canvas/cc.Label')).toBe(c1);
        });

        it('多前导 / 也命中', () => {
            const c1 = addComponent('c1', 'Canvas', 'cc.Label');
            expect(manager.getComponentFromPath('//Canvas/cc.Label')).toBe(c1);
            expect(manager.getComponentFromPath('///Canvas/cc.Label')).toBe(c1);
        });

        it('多层节点下组件路径带前导 / 命中', () => {
            const c1 = addComponent('c1', 'Canvas/Node1', 'cc.Sprite');
            expect(manager.getComponentFromPath('Canvas/Node1/cc.Sprite')).toBe(c1);
            expect(manager.getComponentFromPath('/Canvas/Node1/cc.Sprite')).toBe(c1);
        });

        it('大小写不敏感命中 (带前导 /)', () => {
            const c1 = addComponent('c1', 'Canvas', 'cc.Label');
            expect(manager.getComponentFromPath('/canvas/cc.label')).toBe(c1);
            expect(manager.getComponentFromPath('/CANVAS/CC.LABEL')).toBe(c1);
        });

        it('省略 cc. 前缀 (带前导 /)', () => {
            const c1 = addComponent('c1', 'Canvas', 'cc.Label');
            expect(manager.getComponentFromPath('/Canvas/Label')).toBe(c1);
            expect(manager.getComponentFromPath('/Canvas/label')).toBe(c1);
        });

        it('不存在的组件路径带前导 / 抛出 No component found', () => {
            addComponent('c1', 'Canvas', 'cc.Label');
            expect(() => manager.getComponentFromPath('/Canvas/cc.Missing'))
                .toThrow(/No component found/);
            expect(() => manager.getComponentFromPath('/Missing/cc.Label'))
                .toThrow(/No component found/);
        });

        it('根路径查组件抛错 (根节点不支持挂组件)', () => {
            addComponent('c1', 'Canvas', 'cc.Label');
            expect(() => manager.getComponentFromPath('/cc.Label'))
                .toThrow(/No component found/);
            expect(() => manager.getComponentFromPath('/cc.label'))
                .toThrow(/No component found/);
            expect(() => manager.getComponentFromPath('cc.Label'))
                .toThrow(/No component found/);
        });

        it('查询侧 strip 后与不带 / 走同一分支 (_pathToUuid 直查)', () => {
            const c1 = addComponent('c1', 'Canvas', 'cc.Label');
            const spy = jest.spyOn((manager as any)._pathToUuid, 'get');
            manager.getComponentFromPath('/Canvas/cc.Label');
            expect(spy).toHaveBeenCalledWith('Canvas/cc.Label');
            expect(manager.getComponentFromPath('/Canvas/cc.Label')).toBe(c1);
            spy.mockRestore();
        });
    });
});
