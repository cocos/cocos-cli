import { IEngineEvents, INode, NodeType, } from '../common';

import * as utils from './utils';

import { NodeProxy } from '../main-process/proxy/node-proxy';
import { sceneWorker } from '../main-process/scene-worker';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { EngineProxy } from '../main-process/proxy/engine-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';

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
        });

        it('updateNode', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await NodeProxy.updateNode({
                path: nodePath,
                properties: {
                    position: { x: 5, y: 5, z: 5 }
                }
            });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        });

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
        });

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
        });

        it('removeComponent', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await ComponentProxy.removeComponent({ path: componentPath });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        });

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
        });

        it('open Scene', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await EditorProxy.create({
                type: 'scene',
                baseName: 'abc',
                templateType: '2d',
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            await EditorProxy.open({
                urlOrUUID: `${SceneTestEnv.targetDirectoryURL}/abc.scene`,
            });

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        });

        it('reload Scene', async () => {
            const eventSceneUpdatePromise = utils.once<IEngineEvents>(sceneWorker, 'engine:update');
            const eventSceneTickedPromise = utils.once<IEngineEvents>(sceneWorker, 'engine:ticked');

            await EditorProxy.reload({});

            await eventSceneUpdatePromise;
            await eventSceneTickedPromise;
            expect(true).toBe(true);
        });
    });
});
