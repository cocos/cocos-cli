import { IEngineEvents, INode, NodeType, } from '../common';

import * as utils from './utils';

import { NodeProxy } from '../main-process/proxy/node-proxy';
import { sceneWorker } from '../main-process/scene-worker';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { EngineProxy } from '../main-process/proxy/engine-proxy';
import { SceneProxy } from '../main-process/proxy/scene-proxy';
import { SceneTestEnv } from './scene-test-env';

jest.setTimeout(30 * 60 * 1000); // 半小时（30 分钟）

describe('Engine Proxy 测试', () => {
    let nodePath = '';
    let componentPath = '';

    describe('update engine tick', () => {

        it('repaintInEditMode', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await EngineProxy.repaintInEditMode();

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        });

        it('createNode', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            const createdNode = await NodeProxy.createNodeByType({
                path: '',
                name: 'TestNode',
                nodeType: NodeType.EMPTY,
            });
            nodePath = createdNode!.path;

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('updateNode', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await NodeProxy.updateNode({
                path: nodePath,
                name: 'TestNode',
                properties: {
                    position: { x: 5, y: 5, z: 5 }
                }
            });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('addComponent', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            const component = await ComponentProxy.addComponent({
                nodePath: nodePath,
                component: 'cc.Label'
            });
            componentPath = component.path;

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('setProperty', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await ComponentProxy.setProperty({
                componentPath: componentPath,
                properties: {
                    string: 'abc',
                }
            });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('removeComponent', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await ComponentProxy.removeComponent({ path: componentPath });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('deleteNode', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await NodeProxy.deleteNode({
                path: nodePath,
                keepWorldTransform: false
            });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('open Scene', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await SceneProxy.create({
                baseName: 'abc',
                templateType: '2d',
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            await SceneProxy.open({
                urlOrUUID: `${SceneTestEnv.targetDirectoryURL}/abc.scene`,
            });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);

        it('softReload Scene', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await SceneProxy.softReload({});

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        }, 10000);
    });
});
