import { copy, ensureDir, pathExists, remove } from 'fs-extra';
import { dirname, join } from 'path';

export class LightmapAssetTransaction {
    private readonly backupDir: string;
    private hadTarget = false;
    private prepared = false;

    constructor(private readonly targetDir: string, workspace: string) {
        this.backupDir = join(workspace, 'lightmap-asset-backup');
    }

    async prepare(): Promise<void> {
        this.hadTarget = await pathExists(this.targetDir);
        if (this.hadTarget) await copy(this.targetDir, this.backupDir);
        await remove(this.targetDir);
        await ensureDir(this.targetDir);
        this.prepared = true;
    }

    async rollback(): Promise<void> {
        if (!this.prepared) return;
        await remove(this.targetDir);
        if (this.hadTarget) {
            await ensureDir(dirname(this.targetDir));
            await copy(this.backupDir, this.targetDir);
        }
    }
}
