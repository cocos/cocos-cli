/** Build-only simulator facade. Preview lifecycle is owned by @cocos/scene-editor. */
import { simulatorBuilder } from '../../core/simulator';
export type { ISimulatorBuildState, ISimulatorLogEntry, ISimulatorManifest } from '../../core/simulator';
export const build = simulatorBuilder.build.bind(simulatorBuilder);
export const buildNative = simulatorBuilder.buildNative.bind(simulatorBuilder);
export const buildRuntime = simulatorBuilder.buildRuntime.bind(simulatorBuilder);
export const isBuilt = simulatorBuilder.isBuilt.bind(simulatorBuilder);
export const getManifest = simulatorBuilder.getManifest.bind(simulatorBuilder);
export const getExecutablePath = simulatorBuilder.getExecutablePath.bind(simulatorBuilder);
export const onLog = simulatorBuilder.onLog.bind(simulatorBuilder);
export const onDidChangeBuildState = simulatorBuilder.onDidChangeBuildState.bind(simulatorBuilder);
