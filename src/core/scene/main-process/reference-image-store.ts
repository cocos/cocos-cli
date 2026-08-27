import {
    IReferenceImageAuthorityMutation,
    IReferenceImageAuthoritySnapshot,
    IReferenceImageAuthorityStore,
    IReferenceImageConfig,
    IReferenceImageConfigItem,
    normalizeReferenceImageConfig,
    validateReferenceImageParameters,
} from '../common/reference-image';
import { socketService } from '../../../server/socket';
import { sceneConfigInstance } from '../scene-configs';

const DEFAULT_IMAGE_PARAMETERS: Omit<IReferenceImageConfigItem, 'path'> = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 100,
};

/**
 * The single writer for the project-local reference-image library. Scene
 * Webviews only submit intents so their independent rendering snapshots can
 * never overwrite another Webview's changes.
 */
export class ReferenceImageStore implements IReferenceImageAuthorityStore {
    private revision = 0;
    private mutationQueue: Promise<void> = Promise.resolve();

    async getSnapshot(): Promise<IReferenceImageAuthoritySnapshot> {
        // Do not pair a new in-memory config value with the previous revision
        // while a queued write is awaiting disk persistence.
        await this.mutationQueue.catch(() => undefined);
        const config = normalizeReferenceImageConfig(
            await sceneConfigInstance.get<unknown>('referenceImage', 'local')
        );
        return this.createSnapshot(config, false);
    }

    async mutate(options: IReferenceImageAuthorityMutation): Promise<IReferenceImageAuthoritySnapshot> {
        let resolveTask!: (snapshot: IReferenceImageAuthoritySnapshot) => void;
        let rejectTask!: (reason: unknown) => void;
        const result = new Promise<IReferenceImageAuthoritySnapshot>((resolve, reject) => {
            resolveTask = resolve;
            rejectTask = reject;
        });
        this.mutationQueue = this.mutationQueue
            .catch(() => undefined)
            .then(async () => {
                try {
                    resolveTask(await this.mutateLatest(options));
                } catch (error) {
                    rejectTask(error);
                }
            });
        return result;
    }

    private async mutateLatest(options: IReferenceImageAuthorityMutation): Promise<IReferenceImageAuthoritySnapshot> {
        const current = normalizeReferenceImageConfig(
            await sceneConfigInstance.get<unknown>('referenceImage', 'local')
        );
        const next = this.applyMutation(current, options);
        const changed = !configsEqual(current, next);
        if (changed) {
            await sceneConfigInstance.set('referenceImage', next, 'local');
            this.revision++;
            socketService.io?.emit('scene:invoke', {
                module: 'ReferenceImage',
                method: 'syncFromAuthority',
                args: [],
            });
        }
        return this.createSnapshot(next, changed);
    }

    private applyMutation(config: IReferenceImageConfig, options: IReferenceImageAuthorityMutation): IReferenceImageConfig {
        const next = cloneConfig(config);
        switch (options?.type) {
        case 'add-and-select': {
            const path = validatePath(options.path);
            const sceneUuid = validateSceneUuid(options.sceneUuid);
            if (!next.images.some((image) => image.path === path)) {
                next.images.push({ path, ...DEFAULT_IMAGE_PARAMETERS });
            }
            next.sceneBindings[sceneUuid] = path;
            return next;
        }
        case 'remove': {
            const path = validatePath(options.path);
            const index = next.images.findIndex((image) => image.path === path);
            if (index === -1) return next;
            next.images.splice(index, 1);
            for (const [sceneUuid, imagePath] of Object.entries(next.sceneBindings)) {
                if (imagePath === path) delete next.sceneBindings[sceneUuid];
            }
            return next;
        }
        case 'select': {
            const path = validatePath(options.path);
            const sceneUuid = validateSceneUuid(options.sceneUuid);
            if (!next.images.some((image) => image.path === path)) {
                throw new Error('Reference image is not in the local image library.');
            }
            next.sceneBindings[sceneUuid] = path;
            return next;
        }
        case 'clear-binding': {
            delete next.sceneBindings[validateSceneUuid(options.sceneUuid)];
            return next;
        }
        case 'set-visible': {
            if (typeof options.desiredVisible !== 'boolean') {
                throw new Error('desiredVisible must be a boolean.');
            }
            next.desiredVisible = options.desiredVisible;
            return next;
        }
        case 'commit-parameters': {
            const sceneUuid = validateSceneUuid(options.sceneUuid);
            const path = next.sceneBindings[sceneUuid];
            const image = path ? next.images.find((candidate) => candidate.path === path) : undefined;
            if (!image) throw new Error('The current scene or prefab has no reference image binding.');
            Object.assign(image, validateReferenceImageParameters(options.patch));
            return next;
        }
        default:
            throw new Error('Unknown reference image mutation.');
        }
    }

    private createSnapshot(config: IReferenceImageConfig, changed: boolean): IReferenceImageAuthoritySnapshot {
        return { revision: this.revision, config: cloneConfig(config), changed };
    }
}

function validatePath(path: unknown): string {
    if (typeof path !== 'string' || !path) throw new Error('Reference image path is required.');
    return path;
}

function validateSceneUuid(sceneUuid: unknown): string {
    if (typeof sceneUuid !== 'string' || !sceneUuid) throw new Error('No scene or prefab is currently open.');
    return sceneUuid;
}

function cloneConfig(config: IReferenceImageConfig): IReferenceImageConfig {
    return {
        images: config.images.map((image) => ({ ...image })),
        sceneBindings: { ...config.sceneBindings },
        desiredVisible: config.desiredVisible,
    };
}

function configsEqual(left: IReferenceImageConfig, right: IReferenceImageConfig): boolean {
    return left.desiredVisible === right.desiredVisible
        && left.images.length === right.images.length
        && left.images.every((image, index) => {
            const candidate = right.images[index];
            return candidate?.path === image.path
                && candidate.x === image.x
                && candidate.y === image.y
                && candidate.scaleX === image.scaleX
                && candidate.scaleY === image.scaleY
                && candidate.opacity === image.opacity;
        })
        && Object.keys(left.sceneBindings).length === Object.keys(right.sceneBindings).length
        && Object.entries(left.sceneBindings).every(([sceneUuid, path]) => right.sceneBindings[sceneUuid] === path);
}

export const referenceImageStore = new ReferenceImageStore();
