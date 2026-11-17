export async function compileEffect(force?: boolean) {
    const { afterImport, autoGenEffectBinInfo, supportsEffectBin } = await import('./assets/effect');
    if (!supportsEffectBin()) return;
    try {
        await afterImport(force);
        const { existsSync, statSync } = await import('fs-extra');
        const binPath = autoGenEffectBinInfo.effectBinPath;
        if (existsSync(binPath)) {
            const size = statSync(binPath).size;
            console.log(`[compileEffect] effect.bin generated: ${binPath} (${size} bytes)`);
        } else {
            console.warn(`[compileEffect] effect.bin NOT generated at: ${binPath}`);
        }
    } catch (error) {
        console.error('[compileEffect] Failed:', error);
    }
}

export async function startAutoGenEffectBin() {
    const { autoGenEffectBinInfo } = await import('./assets/effect');
    autoGenEffectBinInfo.autoGenEffectBin = true;
}

export async function getEffectBinPath() {
    const { autoGenEffectBinInfo, afterImport } = await import('./assets/effect');
    if (!autoGenEffectBinInfo.effectBinPath) {
        await afterImport(true);
    }
    return autoGenEffectBinInfo.effectBinPath;
}