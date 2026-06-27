import type { AnimationClip } from 'cc';
import type { IAssetMeta } from '../../../../assets/@types/public';
import { Rpc } from '../../rpc';
import { serializeAuxiliaryCurvesForMeta } from './auxiliary-curve';
import {
    queryEmbeddedPlayerGroups,
    serializeEmbeddedPlayersForMeta,
} from './embedded-player';
import { cloneValue, queryClipEvents } from './utils';

export async function saveSkeletonAnimationMeta(clipUuid: string, clip: AnimationClip): Promise<void> {
    const meta = await Rpc.getInstance().request('assetManager', 'queryAssetMeta', [clipUuid]) as IAssetMeta | null;
    if (!meta) {
        throw new Error(`Animation clip meta not found: ${clipUuid}`);
    }
    if (!meta.userData || typeof meta.userData !== 'object') {
        meta.userData = {};
    }
    const userData = meta.userData as Record<string, any>;

    const events = queryClipEvents(clip);
    if (!events) {
        throw new Error('Animation clip events are invalid.');
    }

    userData.events = events.map((event) => ({
        frame: Number(event.frame) || 0,
        func: typeof event.func === 'string' ? event.func : '',
        params: Array.isArray(event.params) ? cloneValue(event.params) : [],
    }));
    userData.embeddedPlayers = serializeEmbeddedPlayersForMeta(clip);
    userData.editorExtras = {
        ...(isRecord(userData.editorExtras) ? userData.editorExtras : {}),
        embeddedPlayerGroups: queryEmbeddedPlayerGroups(clip),
    };
    userData.wrapMode = Number((clip as any).wrapMode) || 0;
    userData.speed = Number((clip as any).speed) || 0;
    userData.sample = Number((clip as any).sample) || 0;
    userData.auxiliaryCurves = serializeAuxiliaryCurvesForMeta(clip);

    await Rpc.getInstance().request('assetManager', 'saveAssetMeta', [clipUuid, meta]);
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
