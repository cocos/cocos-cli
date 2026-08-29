import { director, Scene, SH, Vec3 } from 'cc';
import { remove } from 'fs-extra';
import type {
    ILightFXBakeEvents,
    ILightFXCancelResult,
    ILightProbeBakeOptions,
    ILightProbeBakeResult,
    ILightProbeBakeService,
} from '../../common';
import { lightFXCoordinator, LightFXBakeOutput } from './baking/lightfx/baker';
import { createDefaultLightFXSettings } from './baking/lightfx/settings';
import { BaseService, register, Service } from './core';

interface ProbeSnapshot {
    normal: Vec3;
    coefficients: Vec3[];
}

@register('LightProbeBake')
export class LightProbeBakeService extends BaseService<ILightFXBakeEvents> implements ILightProbeBakeService {
    async bake(options: ILightProbeBakeOptions = {}): Promise<ILightProbeBakeResult> {
        const started = Date.now();
        const scene = director.getScene() as Scene | null;
        if (!scene) throw new Error('No scene is currently open.');

        const sceneUrl = await this.querySceneUrl();
        const info: any = scene.globals.lightProbeInfo;
        const probes: any[] = info.data?.probes ?? [];
        if (probes.length < 4) throw new Error('At least four generated light probes are required.');

        const giScale = options.giScale ?? info.giScale;
        const giSamples = options.giSamples ?? info.giSamples;
        const bounces = options.bounces ?? info.bounces;
        const settings = createDefaultLightFXSettings('light-probe');
        settings.giProbeScale = giScale;
        settings.giProbeSamples = giSamples;
        settings.giProbePathLength = bounces;

        const previous = this.snapshot(probes);
        let output: LightFXBakeOutput | undefined;
        this.broadcast('lightfx:bake-start', 'light-probe');
        try {
            output = await lightFXCoordinator.bake(scene, 'light-probe', settings, options.timeoutMs ?? 600_000);
            this.validateResult(probes, output);

            const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Bake light probes' });
            try {
                this.applyResult(probes, output);
                info.onProbeBakeFinished();
                await Service.Engine.repaintInEditMode();
                if (options.saveScene !== false) await Service.Editor.save({});
                await Service.Undo.endRecording(undo);
            } catch (error) {
                Service.Undo.cancelRecording(undo);
                throw error;
            }

            this.broadcast('lightfx:bake-end', 'light-probe');
            return { sceneUrl, probeCount: probes.length, giScale, giSamples, bounces, durationMs: Date.now() - started };
        } catch (error) {
            this.restore(probes, previous);
            info.onProbeBakeFinished();
            await Service.Engine.repaintInEditMode();
            this.broadcast('lightfx:bake-end', 'light-probe', this.errorMessage(error));
            throw error;
        } finally {
            if (output) await remove(output.workspace).catch(() => undefined);
        }
    }

    async clearBake(options: { saveScene?: boolean } = {}): Promise<{ probeCount: number }> {
        const scene = director.getScene();
        if (!scene) throw new Error('No scene is currently open.');
        const info: any = scene.globals.lightProbeInfo;
        const probes: any[] = info.data?.probes ?? [];
        const previous = this.snapshot(probes);
        const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Clear light probes' });
        try {
            info.onProbeBakeCleared();
            await Service.Engine.repaintInEditMode();
            if (options.saveScene !== false) await Service.Editor.save({});
            await Service.Undo.endRecording(undo);
            return { probeCount: probes.length };
        } catch (error) {
            Service.Undo.cancelRecording(undo);
            this.restore(probes, previous);
            info.onProbeBakeFinished();
            await Service.Engine.repaintInEditMode();
            throw error;
        }
    }

    cancel(): Promise<ILightFXCancelResult> {
        return lightFXCoordinator.cancel();
    }

    private async querySceneUrl(): Promise<string> {
        const current = await Service.Editor.queryCurrent();
        const sceneUrl = ((current as any)?.__identifier__?.assetUrl ?? (current as any)?.assetUrl) as string | undefined;
        if (!sceneUrl?.endsWith('.scene')) throw new Error('Light probes can only be baked in a saved scene asset.');
        return sceneUrl;
    }

    private validateResult(probes: any[], output: LightFXBakeOutput): void {
        const result = output.result.probes;
        if (result.length !== probes.length) throw new Error(`LightFX returned ${result.length} probes, expected ${probes.length}.`);
        const coefficientCount = SH.getBasisCount() * 3;
        result.forEach((item, index) => {
            if (item.coefficients.length !== coefficientCount) throw new Error(`Light probe ${index} has an invalid SH coefficient count.`);
            const position = probes[index].position;
            const dx = position.x - item.position[0];
            const dy = position.y - item.position[1];
            const dz = position.z - item.position[2];
            if (dx * dx + dy * dy + dz * dz > 1e-6) throw new Error(`Light probe ${index} does not match the exported scene position.`);
        });
    }

    private applyResult(probes: any[], output: LightFXBakeOutput): void {
        const basisCount = SH.getBasisCount();
        output.result.probes.forEach((item, index) => {
            probes[index].normal.set(...item.normal);
            probes[index].coefficients = Array.from({ length: basisCount }, (_, coefficient) => new Vec3(
                item.coefficients[coefficient * 3],
                item.coefficients[coefficient * 3 + 1],
                item.coefficients[coefficient * 3 + 2],
            ));
        });
    }

    private snapshot(probes: any[]): ProbeSnapshot[] {
        return probes.map((probe) => ({
            normal: probe.normal.clone(),
            coefficients: probe.coefficients.map((coefficient: Vec3) => coefficient.clone()),
        }));
    }

    private restore(probes: any[], snapshot: ProbeSnapshot[]): void {
        snapshot.forEach((item, index) => {
            probes[index].normal.set(item.normal);
            probes[index].coefficients = item.coefficients;
        });
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
