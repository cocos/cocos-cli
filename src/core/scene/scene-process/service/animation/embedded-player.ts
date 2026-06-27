import {
    AnimationClip,
    assetManager as ccAssetManager,
    editorExtrasTag,
} from 'cc';
import {
    EmbeddedAnimationClipPlayable,
    EmbeddedParticleSystemPlayable,
    EmbeddedPlayer,
    addEmbeddedPlayerTag,
    clearEmbeddedPlayersTag,
    getEmbeddedPlayersTag,
} from 'cc/editor/embedded-player';
import type {
    IAnimationEmbeddedPlayerDump,
    IAnimationEmbeddedPlayerGroup,
} from '../../../common';
import { cloneValue, clipUuid, getClipSample } from './utils';

export function queryEmbeddedPlayerGroups(clip: AnimationClip): IAnimationEmbeddedPlayerGroup[] {
    const groups = (clip as any)[editorExtrasTag]?.embeddedPlayerGroups;
    return Array.isArray(groups) ? cloneValue(groups) : [];
}

export function ensureEmbeddedPlayerGroups(clip: AnimationClip): IAnimationEmbeddedPlayerGroup[] {
    const clipAny = clip as any;
    if (!clipAny[editorExtrasTag]) {
        clipAny[editorExtrasTag] = {};
    }
    if (!Array.isArray(clipAny[editorExtrasTag].embeddedPlayerGroups)) {
        clipAny[editorExtrasTag].embeddedPlayerGroups = [];
    }
    return clipAny[editorExtrasTag].embeddedPlayerGroups;
}

export function dumpEmbeddedPlayers(clip: AnimationClip): IAnimationEmbeddedPlayerDump[] {
    if (typeof (clip as any)[getEmbeddedPlayersTag] !== 'function') {
        return [];
    }
    return Array.from((clip as any)[getEmbeddedPlayersTag]() as Iterable<EmbeddedPlayer>).map((embeddedPlayer) => {
        const dump: IAnimationEmbeddedPlayerDump = {
            begin: Math.round((Number(embeddedPlayer.begin) || 0) * getClipSample(clip)),
            end: Math.round((Number(embeddedPlayer.end) || 0) * getClipSample(clip)),
            reconciledSpeed: Boolean(embeddedPlayer.reconciledSpeed),
            group: (embeddedPlayer as any)[editorExtrasTag]?.group || '',
        };
        const displayName = (embeddedPlayer as any)[editorExtrasTag]?.displayName;
        const playable = dumpEmbeddedPlayable(embeddedPlayer.playable);
        if (displayName) {
            dump.displayName = displayName;
        }
        if (playable) {
            dump.playable = playable;
        }
        return dump;
    });
}

export function dumpEmbeddedPlayable(playable: unknown): IAnimationEmbeddedPlayerDump['playable'] {
    if (!playable) {
        return undefined;
    }
    if (playable instanceof EmbeddedAnimationClipPlayable) {
        const clip = playable.clip as AnimationClip | null;
        return {
            type: 'animation-clip',
            clip: clip ? clipUuid(clip) : undefined,
            path: playable.path || undefined,
        };
    }
    if (playable instanceof EmbeddedParticleSystemPlayable) {
        return {
            type: 'particle-system',
            path: playable.path || undefined,
        };
    }
    return undefined;
}

export async function addEmbeddedPlayer(clip: AnimationClip, dump: IAnimationEmbeddedPlayerDump): Promise<boolean> {
    const players = dumpEmbeddedPlayers(clip);
    players.push(cloneValue(dump));
    return await replaceEmbeddedPlayers(clip, players);
}

export async function deleteEmbeddedPlayer(clip: AnimationClip, dump: IAnimationEmbeddedPlayerDump): Promise<boolean> {
    const key = embeddedPlayerKey(dump);
    const players = dumpEmbeddedPlayers(clip);
    const filtered = players.filter((player) => embeddedPlayerKey(player) !== key);
    if (filtered.length === players.length) {
        return false;
    }
    return await replaceEmbeddedPlayers(clip, filtered);
}

export async function updateEmbeddedPlayer(clip: AnimationClip, oldDump: IAnimationEmbeddedPlayerDump, newDump: IAnimationEmbeddedPlayerDump): Promise<boolean> {
    const key = embeddedPlayerKey(oldDump);
    const players = dumpEmbeddedPlayers(clip);
    const index = players.findIndex((player) => embeddedPlayerKey(player) === key);
    if (index < 0) {
        return false;
    }
    players[index] = cloneValue(newDump);
    return await replaceEmbeddedPlayers(clip, players);
}

export async function clearEmbeddedPlayers(clip: AnimationClip, group?: string): Promise<boolean> {
    if (!group) {
        return await replaceEmbeddedPlayers(clip, []);
    }
    const players = dumpEmbeddedPlayers(clip).filter((player) => player.group !== group);
    return await replaceEmbeddedPlayers(clip, players);
}

export function addEmbeddedPlayerGroup(clip: AnimationClip, group: IAnimationEmbeddedPlayerGroup): boolean {
    if (!group?.key || !group.type) {
        return false;
    }
    const groups = ensureEmbeddedPlayerGroups(clip);
    if (groups.some((item) => item.key === group.key)) {
        return false;
    }
    groups.push({
        key: group.key,
        name: group.name || group.key,
        type: group.type,
    });
    return true;
}

export async function removeEmbeddedPlayerGroup(clip: AnimationClip, key: string): Promise<boolean> {
    const groups = ensureEmbeddedPlayerGroups(clip);
    const index = groups.findIndex((item) => item.key === key);
    if (index >= 0) {
        groups.splice(index, 1);
    }
    await clearEmbeddedPlayers(clip, key);
    return true;
}

export function serializeEmbeddedPlayersForMeta(clip: AnimationClip) {
    if (typeof (clip as any)[getEmbeddedPlayersTag] !== 'function') {
        return [];
    }
    return Array.from((clip as any)[getEmbeddedPlayersTag]() as Iterable<EmbeddedPlayer>).map((embeddedPlayer) => ({
        begin: Number(embeddedPlayer.begin) || 0,
        end: Number(embeddedPlayer.end) || 0,
        reconciledSpeed: Boolean(embeddedPlayer.reconciledSpeed),
        editorExtras: {
            group: (embeddedPlayer as any)[editorExtrasTag]?.group,
            displayName: (embeddedPlayer as any)[editorExtrasTag]?.displayName,
        },
        playable: dumpEmbeddedPlayable(embeddedPlayer.playable),
    }));
}

async function replaceEmbeddedPlayers(clip: AnimationClip, players: IAnimationEmbeddedPlayerDump[]): Promise<boolean> {
    if (typeof (clip as any)[clearEmbeddedPlayersTag] !== 'function' || typeof (clip as any)[addEmbeddedPlayerTag] !== 'function') {
        return false;
    }

    (clip as any)[clearEmbeddedPlayersTag]();
    for (const player of players) {
        (clip as any)[addEmbeddedPlayerTag](await createEmbeddedPlayer(clip, player));
    }
    return true;
}

async function createEmbeddedPlayer(clip: AnimationClip, dump: IAnimationEmbeddedPlayerDump): Promise<EmbeddedPlayer> {
    if (dump.end < dump.begin || dump.begin < 0) {
        throw new Error(`Invalid embedded player range: ${dump.begin}-${dump.end}`);
    }

    const embeddedPlayer = new EmbeddedPlayer();
    embeddedPlayer.begin = dump.begin / getClipSample(clip);
    embeddedPlayer.end = dump.end / getClipSample(clip);
    embeddedPlayer.reconciledSpeed = Boolean(dump.reconciledSpeed);
    (embeddedPlayer as any)[editorExtrasTag] = {
        group: dump.group || '',
        displayName: dump.displayName,
    };

    if (dump.playable?.type === 'animation-clip') {
        const playable = new EmbeddedAnimationClipPlayable();
        if (dump.playable.clip) {
            playable.clip = await loadAnimationClip(dump.playable.clip);
        }
        if (dump.playable.path) {
            playable.path = dump.playable.path;
        }
        embeddedPlayer.playable = playable;
    } else if (dump.playable?.type === 'particle-system') {
        const playable = new EmbeddedParticleSystemPlayable();
        if (dump.playable.path) {
            playable.path = dump.playable.path;
        }
        embeddedPlayer.playable = playable;
    }

    return embeddedPlayer;
}

async function loadAnimationClip(uuid: string): Promise<AnimationClip | null> {
    return await new Promise((resolve, reject) => {
        ccAssetManager.loadAny(uuid, (error, asset: AnimationClip) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(asset instanceof AnimationClip ? asset : null);
        });
    });
}

function embeddedPlayerKey(dump: IAnimationEmbeddedPlayerDump): string {
    return [
        `begin:${dump.begin}`,
        `end:${dump.end}`,
        `player:${dump.playable?.type || ''}`,
        `group:${dump.group || ''}`,
        `displayName:${dump.displayName || ''}`,
    ].join(',');
}
