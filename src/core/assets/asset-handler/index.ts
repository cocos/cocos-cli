export async function compileEffect(force?: boolean) {
    // TODO 暂不支持 effect 导入
    // 需要做好容错，要保证能执行这个返回数据的函数，否则后续流启动程会被中断
    const { afterImport } = await import('./assets/effect');
    try {
        await afterImport(force);
    } catch (error) {
        console.error(error);
    }
}

export async function startAutoGenEffectBin() {
    const { autoGenEffectBinInfo } = await import('./assets/effect');
    autoGenEffectBinInfo.autoGenEffectBin = true;
}