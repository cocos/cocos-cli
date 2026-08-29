import { Scene } from 'cc';
import { ensureDir, outputFile, readFile, remove } from 'fs-extra';
import { dirname, join } from 'path';
import { Rpc } from '../../../rpc';
import { decodeLightFXOutput, encodeLightFXInput } from './format';
import { LightFXExporter, LightFXExport } from './exporter';
import { LightFXProcess } from './process';
import { LightFXBakeTarget, LightFXResult, LightFXSettings } from './types';

export interface LightFXBakeOutput extends LightFXExport { result: LightFXResult; workspace: string; outputDir: string }

class LightFXCoordinator {
    private target: LightFXBakeTarget | null = null; private controller: AbortController | null = null; private runner: LightFXProcess | null = null;
    get activeTarget(): LightFXBakeTarget | null { return this.target; }
    async bake(scene: Scene, target: LightFXBakeTarget, settings: LightFXSettings, timeoutMs: number): Promise<LightFXBakeOutput> {
        if (this.target) throw new Error(`A ${this.target} LightFX bake is already in progress.`); this.target = target; this.controller = new AbortController(); this.runner = new LightFXProcess();
        const assetRoot = await Rpc.getInstance().request('assetManager', 'queryPath', ['db://assets']) as string | null; if (!assetRoot) throw new Error('The db://assets directory is unavailable.');
        const projectRoot = dirname(assetRoot); const workspace = join(projectRoot, 'temp', 'lightfx-bake', `${target}-${Date.now()}-${process.pid}`); const tmpDir = join(workspace, 'tmp'); const outputDir = join(workspace, 'output');
        try {
            await ensureDir(tmpDir); await ensureDir(outputDir); const exported = await new LightFXExporter(tmpDir, projectRoot).export(scene, target, settings);
            await outputFile(join(tmpDir, 'lfx.in'), encodeLightFXInput(exported.world));
            await this.runner.run({ cwd: workspace, timeoutMs, signal: this.controller.signal, onLog: (line) => console.log(`[LightFX] ${line}`) });
            const result = decodeLightFXOutput(await readFile(join(outputDir, 'lfx.out'))); return { ...exported, result, workspace, outputDir };
        } catch (error) { await remove(workspace).catch(() => undefined); throw error; }
        finally { this.target = null; this.controller = null; this.runner = null; }
    }
    async cancel(): Promise<{ cancelled: boolean; target: LightFXBakeTarget | null }> { const target = this.target; if (!target) return { cancelled: false, target: null }; this.controller?.abort(); await this.runner?.cancel(); return { cancelled: true, target }; }
}
export const lightFXCoordinator = new LightFXCoordinator();
