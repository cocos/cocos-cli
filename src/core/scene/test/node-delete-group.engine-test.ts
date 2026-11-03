/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import type { Node } from 'cc';

describe('Grouped node deletion with the real engine', () => {
    let engine: typeof import('cc');
    let services: typeof import('../scene-process/service/core');
    let writablePath: string;

    beforeAll(async () => {
        jest.resetModules();
        writablePath = await mkdtemp(join(tmpdir(), 'cocos-delete-group-'));
        engine = await (await import('../../test/preload-test-engine')).preloadTestEngine(writablePath);
        services = await import('../scene-process/service/core');
        await import('../scene-process/service/undo');
        await import('../scene-process/service/node');
        await import('../scene-process/service/prefab');
    });

    afterAll(async () => {
        if (writablePath) {
            await rm(writablePath, { recursive: true, force: true });
        }
    });

    it.each([3, 4].flatMap(count => [false, true].flatMap(reverse =>
        [false, true].map(sameName => ({ count, reverse, sameName })),
    )))('restores $count nodes: reverse=$reverse, sameName=$sameName', async ({ count, reverse, sameName }) => {
        const scene = new engine.Scene('Target');
        const { register, Service, ServiceEvents } = services;
        const currentScene = jest.spyOn(engine.director, 'getScene').mockReturnValue(scene);
        register('Editor')(class TestEditor {
            getRootNode() { return scene; }
            getCurrentEditorType() { return 'scene'; }
            async lock() {}
            unlock() {}
        });
        const removeTree = (node: Node) => node.walk(child => {
            child.components.forEach(component => EditorExtends.Component.remove(component.uuid));
            EditorExtends.Node.remove(child.uuid);
        });

        // 节点创建和重新挂载由真实引擎注册，仅补上编辑场景的删除清理监听
        ServiceEvents.on('node:remove', removeTree);
        Service.Undo.clearHistory();
        try {
            for (let index = 0; index < count; index++) {
                const node = new engine.Node(sameName ? 'Cube' : `Cube${index}`);
                node.setPosition(index, 0, 0);
                scene.addChild(node);
            }

            const snapshot = () => scene.children.map(node => ({
                uuid: node.uuid,
                name: node.name,
                position: node.position.x,
            }));
            const expected = snapshot();
            const paths = scene.children.map(node => EditorExtends.Node.getNodePath(node));
            if (reverse) {
                paths.reverse();
            }
            const token = Service.Undo.beginGroup({ label: 'Delete' });
            for (const path of paths) {
                expect(await Service.Node.delete({ path })).not.toBeNull();
            }
            expect(Service.Undo.endGroup(token).success).toBe(true);
            expect(scene.children).toHaveLength(0);
            expect((await Service.Undo.undo()).success).toBe(true);
            expect(snapshot()).toEqual(expected);
            expect((await Service.Undo.redo()).success).toBe(true);
            expect(scene.children).toHaveLength(0);
            expect((await Service.Undo.undo()).success).toBe(true);
            expect(snapshot()).toEqual(expected);
        } finally {
            ServiceEvents.off('node:remove', removeTree);
            removeTree(scene);
            scene.destroy();
            engine.CCObject._deferredDestroy();
            Service.Undo.clearHistory();
            currentScene.mockRestore();
        }
    });
});
