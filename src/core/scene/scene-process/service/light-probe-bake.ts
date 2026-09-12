import { SH, Vec3 } from 'cc';
import type {
    ILightFXBakeEvents,
    ILightFXCancelResult,
    ILightProbeBakeOptions,
    ILightProbeBakeCapabilities,
    ILightProbeBakeResult,
    ILightProbeBakeService,
} from '../../common';
import { lightFXCoordinator, LightFXBakeOutput } from './baking/lightfx/baker';
import { createDefaultLightFXSettings } from './baking/lightfx/settings';
import { lightFXBakeHost } from './baking/lightfx/host';
import { finishSavedLightFXRecording, LightFXResultRetainedError } from './baking/lightfx/saved-recording';
import { BaseService, register, Service } from './core';
import { runLightFXSceneOperation, type LightFXSceneContext } from './baking/lightfx/scene-context';

interface ProbeSnapshot {
    normal: Vec3;
    coefficients: Vec3[];
}

interface LightProbeSettings {
    giScale: number;
    giSamples: number;
    bounces: number;
    reduceRinging: number;
    showWireframe: boolean;
    showConvex: boolean;
    lightProbeSphereVolume: number;
}

@register('LightProbeBake')
export class LightProbeBakeService extends BaseService<ILightFXBakeEvents> implements ILightProbeBakeService {
    async queryCapabilities(): Promise<ILightProbeBakeCapabilities> {
        const host = await lightFXBakeHost.queryCapabilities();
        if (host?.sceneTransactionVersion !== 1 || typeof host.busy !== 'boolean') {
            throw new Error('The LightFX host does not support scene transaction protocol version 1.');
        }
        return { version: 1, resultLifecycleVersion: 1, sceneTransactionVersion: 1,
            ...(host.diagnosticsVersion === 1 ? { diagnostics: await lightFXCoordinator.queryDiagnostics('light-probe') } : {}),
            ...(host.cancelOwnershipVersion === 1 ? { cancelVersion: 1 as const, cancellable: lightFXCoordinator.canCancel('light-probe') } : {}), busy: host.busy };
    }

    async bake(options: ILightProbeBakeOptions = {}): Promise<ILightProbeBakeResult> {
        return runLightFXSceneOperation('light-probe', 'bake', context => this.bakeExclusive(options, context));
    }

    private async bakeExclusive(options: ILightProbeBakeOptions, context: LightFXSceneContext): Promise<ILightProbeBakeResult> {
        const started = Date.now();
        const { scene } = context;
        const sceneUrl = await this.querySceneUrl();
        context.assertCurrent();
        const info: any = scene.globals.lightProbeInfo;
        const probes: any[] = info.data?.probes ?? [];
        if (probes.length < 4) throw new Error('At least four generated light probes are required.');

        const previousSettings = this.getSettings(info);
        const settingsToApply: LightProbeSettings = {
            giScale: options.giScale ?? previousSettings.giScale,
            giSamples: options.giSamples ?? previousSettings.giSamples,
            bounces: options.bounces ?? previousSettings.bounces,
            reduceRinging: options.reduceRinging ?? previousSettings.reduceRinging,
            showWireframe: options.showWireframe ?? previousSettings.showWireframe,
            showConvex: options.showConvex ?? previousSettings.showConvex,
            lightProbeSphereVolume: options.lightProbeSphereVolume ?? previousSettings.lightProbeSphereVolume,
        };
        const settings = createDefaultLightFXSettings('light-probe');
        settings.giProbeScale = settingsToApply.giScale;
        settings.giProbeSamples = settingsToApply.giSamples;
        settings.giProbePathLength = settingsToApply.bounces;

        const previous = this.snapshot(probes);
        let output: LightFXBakeOutput | undefined;
        let nativeCommitted = false;
        this.broadcast('lightfx:bake-start', 'light-probe');
        try {
            output = await lightFXCoordinator.bake(scene, 'light-probe', settings, options.timeoutMs ?? 600_000);
            const completed = output;
            return await context.run(async save => {
                const output = completed;
                this.validateResult(probes, output);
                await lightFXCoordinator.commit(output.operationId);
                nativeCommitted = true;

                const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Bake light probes' });
                try {
                    this.applySettings(info, settingsToApply);
                    this.applyResult(probes, output);
                    info.onProbeBakeFinished();
                    await Service.Engine.repaintInEditMode();
                    await finishSavedLightFXRecording(Service.Undo, undo,
                        options.saveScene !== false ? save : undefined);
                } catch (error) {
                    if (!(error instanceof LightFXResultRetainedError)) {
                        Service.Undo.cancelRecording(undo);
                        this.restore(probes, previous);
                        this.applySettings(info, previousSettings);
                        info.onProbeBakeFinished();
                        await Service.Engine.repaintInEditMode();
                    }
                    throw error;
                }

                this.broadcast('lightfx:bake-end', 'light-probe');
                return {
                    sceneUrl,
                    probeCount: probes.length,
                    ...settingsToApply,
                    durationMs: Date.now() - started,
                    diagnostics: await lightFXCoordinator.queryDiagnostics?.('light-probe'),
                };
            });
        } catch (error) {
            if (output && !nativeCommitted) await lightFXCoordinator.rollback(output.operationId).catch(() => undefined);
            this.broadcast('lightfx:bake-end', 'light-probe', this.errorMessage(error));
            throw error;
        }
    }

    async clearBake(options: { saveScene?: boolean } = {}): Promise<{ probeCount: number }> {
        return runLightFXSceneOperation('light-probe', 'clear', context => this.clearBakeExclusive(options, context));
    }

    private async clearBakeExclusive(options: { saveScene?: boolean }, context: LightFXSceneContext): Promise<{ probeCount: number }> {
        const { scene } = context;
        return context.run(async save => {
            const info: any = scene.globals.lightProbeInfo;
            const probes: any[] = info.data?.probes ?? [];
            const previous = this.snapshot(probes);
            const undo = Service.Undo.beginRecording([scene.uuid], { label: 'Clear light probes' });
            try {
                info.onProbeBakeCleared();
                await Service.Engine.repaintInEditMode();
                await finishSavedLightFXRecording(Service.Undo, undo,
                    options.saveScene !== false ? save : undefined);
                return { probeCount: probes.length };
            } catch (error) {
                if (error instanceof LightFXResultRetainedError) throw error;
                Service.Undo.cancelRecording(undo);
                this.restore(probes, previous);
                info.onProbeBakeFinished();
                await Service.Engine.repaintInEditMode();
                throw error;
            }
        });
    }

    cancel(): Promise<ILightFXCancelResult> {
        return lightFXCoordinator.cancel('light-probe');
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

    private getSettings(info: any): LightProbeSettings {
        return {
            giScale: info.giScale,
            giSamples: info.giSamples,
            bounces: info.bounces,
            reduceRinging: info.reduceRinging,
            showWireframe: info.showWireframe,
            showConvex: info.showConvex,
            lightProbeSphereVolume: info.lightProbeSphereVolume,
        };
    }

    private applySettings(info: any, settings: LightProbeSettings): void {
        info.giScale = settings.giScale;
        info.giSamples = settings.giSamples;
        info.bounces = settings.bounces;
        info.reduceRinging = settings.reduceRinging;
        info.showWireframe = settings.showWireframe;
        info.showConvex = settings.showConvex;
        info.lightProbeSphereVolume = settings.lightProbeSphereVolume;
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
