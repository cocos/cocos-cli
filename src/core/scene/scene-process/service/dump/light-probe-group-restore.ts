import type { LightProbeGroup } from 'cc';

/** Replace the engine's registered array reference without rebuilding restored SH. */
export function restoreLightProbeGroupCache(component: object, dump: { type?: string; extends?: string[]; value?: object }): void {
    if ((dump.type !== 'cc.LightProbeGroup' && !dump.extends?.includes('cc.LightProbeGroup')) || !dump.value || !('probes' in dump.value || '_probes' in dump.value)) return;
    const group = component as LightProbeGroup;
    if (!group.isValid || !group.enabledInHierarchy) return;
    // onRestore is absent on LightProbeGroup. Calling onProbeChanged here would
    // rebuild the global table before every group's snapshot has been restored.
    group.node.scene?.globals.lightProbeInfo.syncData(group.node, group.probes);
}
