import { Asset, VirtualAsset } from '@editor/asset-db';
import * as cc from 'cc';
import {
    addEmbeddedPlayerTag,
    EmbeddedAnimationClipPlayable,
    EmbeddedParticleSystemPlayable,
    EmbeddedPlayer,
} from 'cc/editor/embedded-player';
import { additiveSettingsTag } from 'cc/editor/exotic-animation';
import { pathToFileURL } from 'url';
import { serializeForLibrary } from '../utils/serialize-library';
import { splitAnimation } from '../utils/split-animation';
import { loadAssetSync } from '../utils/load-asset-sync';
import { getOriginalAnimationLibraryPath } from './original-animation';
import { glTfReaderManager } from './reader-manager';

import { getDependUUIDList } from '../../utils';
import { AnimationImportSetting } from '../../meta-schemas/glTF.meta';
import assert from 'assert';
import { AssetHandler } from '../../../@types/protected';

export interface IGltfAnimationUserData {
    gltfIndex: number;
    events: Array<{
        frame: number;
        func: string;
        params: string[];
    }>;
    editorExtras?: unknown;
    embeddedPlayers?: Array<{
        editorExtras?: unknown;
        begin: number;
        end: number;
        reconciledSpeed: boolean;
        playable:
        | {
            type: 'animation-clip';
            path: string;
            clip: string;
        }
        | {
            type: 'particle-system';
            path: string;
        };
    }>;
    auxiliaryCurves?: AnimationImportSetting['splits'][0]['auxiliaryCurves'];
    wrapMode: number;
    speed?: number;
    sample?: number;
    span?: {
        /**
         * 起始时间（秒）。
         */
        from: number;

        /**
         * 结束时间（秒）。
         */
        to: number;
    };
    additive?: AnimationImportSetting['splits'][0]['additive'];
}

export const GltfAnimationHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'gltf-animation',

    // 引擎内对应的类型
    assetType: 'cc.AnimationClip',

    /**
     * 允许这种类型的资源进行实例化
     */
    instantiation: '.animation',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.18',
        versionCode: 3,
        migrations: [
            {
                version: '1.0.16',
                migrate: migrateEvents_3_3_0,
            },
        ],

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的 boolean
         * 如果返回 false，则下次启动还会重新导入
         * @param asset
         */
        async import(asset: VirtualAsset) {
            if (!asset.parent) {
                return false;
            }

            const userData = asset.userData as IGltfAnimationUserData;

            userData.events ??= [];

            const originalAnimationPath = asset.parent.getFilePath(getOriginalAnimationLibraryPath(userData.gltfIndex));
            let originalAnimationURL = pathToFileURL(originalAnimationPath).href;
            if (originalAnimationURL) {
                originalAnimationURL = originalAnimationURL.replace('.bin', '.cconb');
            }
            const originalAnimationClip = await new Promise<cc.AnimationClip>((resolve, reject) => {
                cc.assetManager.loadAny({ url: originalAnimationURL }, { preset: 'remote' }, null, (err, data: cc.AnimationClip) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            });

            let span = userData.span;
            if (span && span.from === 0 && span.to === asset.parent.userData.duration) {
                span = undefined;
            }

            const animationClip = span ? splitAnimation(originalAnimationClip, span.from, span.to) : originalAnimationClip;

            animationClip.name = asset._name;
            if (animationClip.name.endsWith('.animation')) {
                animationClip.name = animationClip.name.substr(0, animationClip.name.length - '.animation'.length);
            }

            animationClip.events = userData.events.map((event) => ({
                frame: event.frame,
                func: event.func,
                params: event.params.slice(),
            }));

            animationClip.wrapMode = userData.wrapMode ?? cc.AnimationClip.WrapMode.Loop;

            if (userData.speed !== undefined) {
                animationClip.speed = userData.speed;
            }

            if (userData.sample !== undefined) {
                animationClip.sample = userData.sample;
            }

            if (typeof userData.editorExtras !== 'undefined') {
                animationClip[cc.editorExtrasTag] = JSON.parse(JSON.stringify(userData.editorExtras));
            }

            if (userData.embeddedPlayers) {
                const { embeddedPlayers: embeddedPlayerInfos } = userData;
                for (const { begin, end, reconciledSpeed, editorExtras, playable: playableInfo } of embeddedPlayerInfos) {
                    const subregion = new EmbeddedPlayer();
                    if (typeof editorExtras !== 'undefined') {
                        subregion[cc.editorExtrasTag] = JSON.parse(JSON.stringify(editorExtras));
                    }
                    subregion.begin = begin;
                    subregion.end = end;
                    subregion.reconciledSpeed = reconciledSpeed;
                    if (playableInfo.type === 'animation-clip') {
                        const playable = new EmbeddedAnimationClipPlayable();
                        playable.path = playableInfo.path;
                        if (playableInfo.clip) {
                            playable.clip = loadAssetSync(playableInfo.clip, cc.AnimationClip) ?? null;
                        }
                        subregion.playable = playable;
                    } else if (playableInfo.type === 'particle-system') {
                        const playable = new EmbeddedParticleSystemPlayable();
                        playable.path = playableInfo.path;
                        subregion.playable = playable;
                    }
                    animationClip[addEmbeddedPlayerTag](subregion);
                }
            }

            const additiveSettings = animationClip[additiveSettingsTag];
            additiveSettings.enabled = false;
            additiveSettings.refClip = null;
            const customDependencies: string[] = [];
            if (typeof userData.additive !== 'undefined') {
                const additiveSettings = animationClip[additiveSettingsTag];
                if (userData.additive.enabled) {
                    additiveSettings.enabled = true;
                    if (userData.additive.refClip) {
                        customDependencies.push(userData.additive.refClip);
                        additiveSettings.refClip = loadAssetSync(userData.additive.refClip, cc.AnimationClip) ?? null;
                    }
                }
            }

            if (typeof userData.auxiliaryCurves !== 'undefined') {
                for (const [name, { curve: curveSerialized }] of Object.entries(userData.auxiliaryCurves)) {
                    const curveDeserialized = cc.deserialize(curveSerialized, undefined, undefined);
                    assert(curveDeserialized instanceof cc.RealCurve);
                    const auxiliaryCurve = animationClip.addAuxiliaryCurve_experimental(name);
                    auxiliaryCurve.preExtrapolation = curveDeserialized.preExtrapolation;
                    auxiliaryCurve.postExtrapolation = curveDeserialized.postExtrapolation;
                    auxiliaryCurve.assignSorted(curveDeserialized.keyframes());
                }
            }

            // Compute hash
            void animationClip.hash;

            const { extension, data } = serializeForLibrary(animationClip);
            await asset.saveToLibrary(extension, data as any);

            const depends = getDependUUIDList(data as string);
            asset.setData('depends', Array.from(new Set([...depends, ...customDependencies])));

            return true;
        },
    },
};

export default GltfAnimationHandler;

// eslint-disable-next-line camelcase
function migrateEvents_3_3_0(asset: Asset) {
    type OldUserData = Omit<IGltfAnimationUserData, 'events'> & {
        events?: Array<{
            frame: number;
            functionName: string;
            parameters: string[];
        }>;
    };

    const oldUserData = asset.meta.userData as OldUserData;
    const oldEvents = oldUserData.events;
    if (!oldEvents) {
        return;
    }

    const newEvents = oldEvents.map((oldEvent) => ({
        frame: oldEvent.frame,
        func: oldEvent.functionName,
        params: oldEvent.parameters.slice(),
    }));

    const newUserData = asset.meta.userData as IGltfAnimationUserData;
    newUserData.events = newEvents;
}
