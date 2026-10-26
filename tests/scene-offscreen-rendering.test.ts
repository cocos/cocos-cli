/** Requires gl/Canvas and a graphics driver. COCOS_TEST_BAKE / COCOS_TEST_LIGHTFX
 * additionally exercise installed cmft / LightFX tools, publishing and clearing real assets. */
const graphicsTest = process.env.COCOS_TEST_OFFSCREEN === '1' ? describe : describe.skip;
graphicsTest('standalone Worker reflection-probe rendering', () => {
    it('captures six cubemap faces without a private editor or browser connection', async () => {
        const { globalSetup } = await import('../src/core/test/global-setup');
        await globalSetup();
        const { loadSceneI18n } = await import('../src/core/scene');
        await loadSceneI18n();
        const { EditorProxy } = await import('../src/core/scene/main-process/proxy/editor-proxy');
        const { NodeProxy } = await import('../src/core/scene/main-process/proxy/node-proxy');
        const { ComponentProxy } = await import('../src/core/scene/main-process/proxy/component-proxy');
        const { Rpc } = await import('../src/core/scene/main-process/rpc');
        const { NodeType } = await import('../src/core/scene/common');
        const { assetManager } = await import('../src/core/assets');
        const sceneName = `OffscreenCaptureTest_${Date.now()}`;
        const scene = await EditorProxy.create({ type: 'scene', baseName: sceneName, targetDirectory: 'db://assets' });
        try {
            await EditorProxy.open({ urlOrUUID: scene.assetUuid });
            const light = await NodeProxy.createByType({ path: 'BakeLight', nodeType: NodeType.DIRECTIONAL_LIGHT });
            const cube = await NodeProxy.createByType({ path: 'BakeGeometry', nodeType: NodeType.CUBE });
            await NodeProxy.update({ path: cube!.path, properties: { position: { x: 0, y: 0, z: -3 } } });
            if (process.env.COCOS_TEST_LIGHTFX === '1') {
                const { LightmapBakeProxy, LightProbeBakeProxy } = await import('../src/core/scene/main-process/proxy/lightfx-bake-proxy');
                await NodeProxy.update({ path: cube!.path, properties: { mobility: 0 } });
                await NodeProxy.update({ path: light!.path, properties: { mobility: 0 } });
                const meshIndex = cube!.components!.findIndex(comp => comp.type === 'cc.MeshRenderer');
                const mesh = cube!.components![meshIndex];
                const dump: any = await Rpc.getInstance().request('Component', 'query', [mesh.path]);
                const settings = dump.value.bakeSettings;
                for (const [key, value] of Object.entries({ bakeable: true, castShadow: true, receiveShadow: true, bakeToLightProbe: true, lightmapSize: 64 })) {
                    settings.value[key].value = value;
                }
                await Rpc.getInstance().request('Component', 'setProperty', [{ nodePath: cube!.path, path: `__comps__.${meshIndex}.bakeSettings`, dump: settings }]);
                await EditorProxy.save({});
                const lightmap = await LightmapBakeProxy.bake({ resolution: 128, msaa: 1, giSamples: 1, giPathLength: 1, threads: 1, saveScene: true, timeoutMs: 90000 });
                expect(lightmap.textureUrls.length).toBeGreaterThan(0);
                expect((await LightmapBakeProxy.queryBakeInfo()).missingTextureUuids).toEqual([]);
                const group = await ComponentProxy.add({ nodePath: cube!.path, component: 'cc.LightProbeGroup' });
                await ComponentProxy.setProperty({ componentPath: group.path, properties: { nProbesX: 2, nProbesY: 2, nProbesZ: 2 } });
                await (Rpc.getInstance() as any).request('Component', 'executeMethod', [{ path: group.path, name: 'generateLightProbes', args: [] }]);
                const probes = await LightProbeBakeProxy.bake({ giSamples: 64, bounces: 1, saveScene: true, timeoutMs: 90000 });
                expect(probes.probeCount).toBe(8);
                expect((await LightProbeBakeProxy.clearBake({ saveScene: true })).probeCount).toBe(8);
                expect((await LightmapBakeProxy.clearBake({ saveScene: true, deleteAssets: true })).failedAssetCount).toBe(0);
            }
            const node = await NodeProxy.createByType({ path: 'CaptureProbe', nodeType: NodeType.EMPTY });
            expect(node).not.toBeNull();
            const component = await ComponentProxy.add({ nodePath: node!.path, component: 'cc.ReflectionProbe' });
            await ComponentProxy.setProperty({ componentPath: component.path, properties: { resolution: 64, probeType: 0 } });
            const captured = await (Rpc.getInstance() as any).request('ReflectionProbe', 'capturePixels', [node!.path, 20000], { timeout: 25000 });
            expect(captured.resolution).toBe(64);
            expect(captured.faces).toHaveLength(6);
            for (const face of captured.faces) expect(Buffer.from(face, 'base64')).toHaveLength(64 * 64 * 4);
            expect(captured.faces.some((face: string) => Buffer.from(face, 'base64').some((value, index) => index % 4 !== 3 && value !== 0))).toBe(true);
            if (process.env.COCOS_TEST_BAKE === '1') {
                const { ReflectionProbeProxy } = await import('../src/core/scene/main-process/proxy/reflection-probe-proxy');
                await EditorProxy.save({});
                const baked = await ReflectionProbeProxy.bake({ nodePath: node!.path, saveScene: true, timeoutMs: 90000 });
                expect(assetManager.queryAssetInfo(baked.cubemapUuid)).toBeTruthy();
                await EditorProxy.close({});
                await EditorProxy.open({ urlOrUUID: scene.assetUuid });
                const saved: any = await ComponentProxy.query({ path: component.path });
                expect(JSON.stringify(saved)).toContain(baked.cubemapUuid);
                const cleared = await ReflectionProbeProxy.clearAll({ saveScene: true, deleteAssets: true });
                expect(cleared.failures).toEqual([]);
                expect(cleared.clearedCount).toBe(1);
            }
        } finally {
            await EditorProxy.close({});
            await assetManager.removeAsset(scene.assetUuid);
            for (const directory of [`db://assets/${sceneName}`, `db://assets/LightFX/scene-${scene.assetUuid}`]) {
                const info = assetManager.queryAssetInfo(directory);
                if (info) await assetManager.removeAsset(info.uuid);
            }
            const { sceneWorker } = await import('../src/core/scene/main-process/scene-worker');
            await sceneWorker.stop();
        }
    }, 360000);
});
