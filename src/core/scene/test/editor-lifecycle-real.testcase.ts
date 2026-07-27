import { IBaseIdentifier, INodeInfo, ISceneInfo } from '../common';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';
import { assetManager } from '../../assets';
import { sceneWorker } from '../main-process/scene-worker';

interface AuditEvent {
    type: 'assetAdded' | 'assetChanged' | 'assetDeleted';
    uuid: string;
    url: string;
    path: string;
}

function assetPath(url: string): string {
    return url.replace(/^db:\/\/assets\//, '');
}

function identifierLog(identifier: (IBaseIdentifier | { uuid?: string; url?: string }) | null): Record<string, unknown> | null {
    if (!identifier) {
        return null;
    }
    const value = identifier as any;
    const url = value.assetUrl ?? value.url ?? null;
    return {
        uuid: value.assetUuid ?? value.uuid ?? null,
        url,
        path: url ? assetPath(url) : null,
    };
}

function currentSessionLog(entity: ISceneInfo | INodeInfo | null): Record<string, unknown> | null {
    if (!entity) {
        return null;
    }
    const value = entity as any;
    const prefabUuid = value.prefab?.asset?.uuid ?? value.prefab?.assetUuid ?? null;
    return {
        uuid: value.assetUuid ?? prefabUuid ?? null,
        url: value.assetUrl ?? null,
        path: value.assetUrl ? assetPath(value.assetUrl) : null,
    };
}

describe('真实 Scene/Prefab 删除 + Save As 生命周期审计', () => {
    it('Scene delete -> Save As; Prefab delete -> Save twice; then opens a new Scene', async () => {
        const suffix = `lifecycle-audit-${Date.now()}`;
        const directory = `${SceneTestEnv.targetDirectoryURL}/lifecycle-audit`;
        const assets: Array<IBaseIdentifier> = [];
        const events: AuditEvent[] = [];

        const onAssetEvent = (type: AuditEvent['type']) => (asset: any) => {
            if (!asset?.url?.includes('/lifecycle-audit/')) {
                return;
            }
            events.push({
                type,
                uuid: asset.uuid,
                url: asset.url,
                path: assetPath(asset.url),
            });
        };
        const onAssetAdded = onAssetEvent('assetAdded');
        const onAssetChanged = onAssetEvent('assetChanged');
        const onAssetDeleted = onAssetEvent('assetDeleted');
        assetManager.on('asset-add', onAssetAdded);
        assetManager.on('asset-change', onAssetChanged);
        assetManager.on('asset-delete', onAssetDeleted);

        const audit: Array<Record<string, unknown>> = [];
        const record = (step: string, identifier?: IBaseIdentifier | null, entity?: any) => {
            audit.push({
                step,
                asset: identifierLog(identifier ?? null),
                session: currentSessionLog(entity ?? null),
                sceneProcessConnected: !!sceneWorker.process.connected,
                eventCount: events.length,
            });
        };

        const create = async (type: 'scene' | 'prefab', name: string): Promise<IBaseIdentifier> => {
            const identifier = await EditorProxy.create({
                type,
                baseName: `${suffix}-${name}`,
                targetDirectory: directory,
            });
            assets.push(identifier);
            record(`create-${type}-${name}`, identifier);
            return identifier;
        };
        const queryAssetInfo = async (step: string, identifier: IBaseIdentifier) => {
            const info = await assetManager.queryAssetInfo(identifier.assetUuid);
            audit.push({
                step: `queryAssetInfo-${step}`,
                asset: identifierLog(identifier),
                result: info ? { uuid: info.uuid, url: info.url, path: assetPath(info.url) } : null,
                sceneProcessConnected: !!sceneWorker.process.connected,
                eventCount: events.length,
            });
            return info;
        };
        const eventIndex = (type: AuditEvent['type'], uuid: string, from = 0) => events.findIndex((event, index) => index >= from && event.type === type && event.uuid === uuid);
        const assertSaveAsEventOrder = (source: IBaseIdentifier, target: IBaseIdentifier, saveEventStart: number) => {
            expect(source.assetUuid).not.toBe(target.assetUuid);
            expect(source.assetUrl).not.toBe(target.assetUrl);
            expect(assetPath(source.assetUrl)).not.toBe(assetPath(target.assetUrl));
            const deleted = eventIndex('assetDeleted', source.assetUuid);
            const added = eventIndex('assetAdded', target.assetUuid);
            const changed = eventIndex('assetChanged', target.assetUuid, saveEventStart);
            expect(deleted).toBeGreaterThanOrEqual(0);
            expect(added).toBeGreaterThan(deleted);
            expect(changed).toBeGreaterThan(added);
        };
        const saveDeletedSourceAs = async (
            type: 'scene' | 'prefab',
            source: IBaseIdentifier,
            sourceLabel: string,
            targetLabel: string,
        ): Promise<IBaseIdentifier> => {
            await EditorProxy.open({ urlOrUUID: source.assetUuid });
            record(`open-${type}-${sourceLabel}`, source, await EditorProxy.queryCurrent() as any);
            await assetManager.removeAsset(source.assetUuid, { useTrash: false });
            record(`delete-${type}-${sourceLabel}`, source, await EditorProxy.queryCurrent() as any);

            const target = await create(type, targetLabel);
            const saveEventStart = events.length;
            const saved = await EditorProxy.save({ urlOrUUID: target.assetUuid });
            const current = await EditorProxy.queryCurrent();
            record(`save-${type}-${targetLabel}`, saved as any, current as any);

            expect(saved.uuid).toBe(target.assetUuid);
            expect((current as any)?.assetUuid ?? (current as any)?.prefab?.asset?.uuid).toBe(target.assetUuid);
            expect(await queryAssetInfo(`${type}-${sourceLabel}-source-deleted`, source)).toBeNull();
            expect(await queryAssetInfo(`${type}-${targetLabel}-target-saved`, target)).not.toBeNull();
            assertSaveAsEventOrder(source, target, saveEventStart);
            return target;
        };

        try {
            const sceneSource = await create('scene', 'scene-source');
            const prefabSourceA = await create('prefab', 'prefab-source-a');
            const prefabSourceB = await create('prefab', 'prefab-source-b');

            const sceneTarget = await saveDeletedSourceAs('scene', sceneSource, 'scene-source', 'scene-target');
            const prefabTargetA = await saveDeletedSourceAs('prefab', prefabSourceA, 'prefab-source-a', 'prefab-target-a');
            const prefabTargetB = await saveDeletedSourceAs('prefab', prefabSourceB, 'prefab-source-b', 'prefab-target-b');

            const newScene = await create('scene', 'scene-final');
            const finalScene = await EditorProxy.open({ urlOrUUID: newScene.assetUuid }) as ISceneInfo;
            record('open-final-scene', newScene, finalScene);
            expect(finalScene.assetUuid).toBe(newScene.assetUuid);
            expect(sceneWorker.process.connected).toBe(true);
            expect(await queryAssetInfo('final-scene', newScene)).not.toBeNull();
            expect(await queryAssetInfo('scene-target-final', sceneTarget)).not.toBeNull();
            expect(await queryAssetInfo('prefab-target-a-final', prefabTargetA)).not.toBeNull();
            expect(await queryAssetInfo('prefab-target-b-final', prefabTargetB)).not.toBeNull();

            const relevantEvents = events.map(({ type, uuid, url, path }) => ({ type, uuid, url, path }));
            console.log(JSON.stringify({ audit, events: relevantEvents }, null, 2));
        } finally {
            assetManager.off('asset-add', onAssetAdded);
            assetManager.off('asset-change', onAssetChanged);
            assetManager.off('asset-delete', onAssetDeleted);
            await EditorProxy.close({ save: false }).catch(() => undefined);
            for (const asset of assets.reverse()) {
                await assetManager.removeAsset(asset.assetUuid, { useTrash: false }).catch(() => undefined);
            }
            await assetManager.removeAsset(directory, { useTrash: false }).catch(() => undefined);
        }
    });
});
