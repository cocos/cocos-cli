import { Vec3 } from 'cc';
import type { Scene } from 'cc';

interface SavedProbeCoefficients {
    values: Vec3[][];
    next: number;
}

/**
 * Keep deserialized SH alive while LightProbeGroup.onLoad registers groups one
 * by one. Older engines resize the saved probe array after each registration,
 * truncating later groups before they have had a chance to load.
 */
export function preserveLightProbeCoefficients(scene: Scene): (loaded: Scene) => void {
    const byPosition = new Map<string, SavedProbeCoefficients>();
    const keyOf = (position: Readonly<Vec3>) => JSON.stringify([position.x, position.y, position.z]);
    for (const probe of scene.globals.lightProbeInfo.data?.probes ?? []) {
        const key = keyOf(probe.position);
        let entry = byPosition.get(key);
        if (!entry) {
            entry = { values: [], next: 0 };
            byPosition.set(key, entry);
        }
        entry.values.push(probe.coefficients.map(value => Vec3.clone(value)));
    }

    return loaded => {
        // Never apply an old scene's data to a replacement/later editor session.
        if (loaded !== scene || byPosition.size === 0) return;
        const info = loaded.globals.lightProbeInfo;
        let restored = false;
        for (const probe of info.data?.probes ?? []) {
            const entry = byPosition.get(keyOf(probe.position));
            const values = entry?.values[entry.next++];
            if (!values) continue;
            // Match positions, not rebuilt array indices. Consume duplicate positions
            // separately and leave new/unmatched probes to the engine's own lifecycle.
            probe.coefficients = values.map(value => Vec3.clone(value));
            restored = true;
        }
        byPosition.clear();
        if (restored) info.onProbeBakeFinished();
    };
}
