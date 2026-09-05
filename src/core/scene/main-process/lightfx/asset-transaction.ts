import { copy, ensureDir, pathExists, remove } from 'fs-extra';
import { dirname, join } from 'path';

/** Replaces one lightmap directory while retaining enough state for a later rollback. */
export class LightmapAssetTransaction {
    private readonly backupDir: string;
    private hadTarget = false;
    private prepared = false;

    constructor(private readonly targetDir: string, workspace: string) {
        this.backupDir = join(workspace, 'lightmap-asset-backup');
    }

    public async prepare(): Promise<void> {
        if (this.prepared) {
            return;
        }
        this.hadTarget = await pathExists(this.targetDir);
        if (this.hadTarget) {
            await copy(this.targetDir, this.backupDir);
        }
        await remove(this.targetDir);
        await ensureDir(this.targetDir);
        this.prepared = true;
    }

    public async rollback(): Promise<void> {
        if (!this.prepared) {
            return;
        }
        await remove(this.targetDir);
        if (this.hadTarget) {
            await ensureDir(dirname(this.targetDir));
            await copy(this.backupDir, this.targetDir);
        }
        // Keep the transaction retryable until the previous asset directory is fully restored.
        this.prepared = false;
    }

    public async preserveMeta(relativeAssetPath: string): Promise<void> {
        if (!this.hadTarget) {
            return;
        }
        const metaPath = `${relativeAssetPath}.meta`;
        const source = join(this.backupDir, metaPath);
        if (await pathExists(source)) {
            await copy(source, join(this.targetDir, metaPath));
        }
    }
}
