/** Map newer serialized bake settings onto the selected engine's real legacy class. */
export function installBakeSettingsCompatibility(engine: any): boolean {
    const { js, deserialize } = engine;
    const Settings = js?.getClassByName?.('cc.ModelLightmapSettings');
    if (!Settings || !deserialize || !js.setClassAlias) return false;
    const modern = js.getClassByName('cc.ModelBakeSettings');
    if (modern && modern !== Settings) return false;
    if (!modern) js.setClassAlias(Settings, 'cc.ModelBakeSettings');
    const prototype = engine.MeshRenderer?.prototype;
    if (!prototype) return false;
    if (!Object.getOwnPropertyDescriptor(prototype, 'bakeSettings')) {
        Object.defineProperty(prototype, 'bakeSettings', {
            configurable: true,
            get() { return this.lightmapSettings; },
            set(value) { this.lightmapSettings = value ?? new Settings(); },
        });
    }
    for (const Renderer of [engine.MeshRenderer, engine.SkinnedMeshRenderer, engine.SkinnedMeshBatchRenderer]) {
        if (!Renderer) continue;
        // Prime the native decoder without changing serializable property lists.
        if (!Object.prototype.hasOwnProperty.call(Renderer, '__deserialize__')) {
            deserialize({ __type__: js.getClassName(Renderer) });
        }
        const decode = Renderer.__deserialize__;
        if (typeof decode !== 'function' || decode.__cliLegacyBakeSettings) continue;
        const wrapped = function (deserializer: any, object: any, serialized: any, constructor: any) {
            const data = serialized.lightmapSettings == null && serialized.bakeSettings != null
                ? { ...serialized, lightmapSettings: serialized.bakeSettings } : serialized;
            decode(deserializer, object, data, constructor);
            if (object.lightmapSettings == null) object.lightmapSettings = new Settings();
        };
        Object.defineProperty(wrapped, '__cliLegacyBakeSettings', { value: true });
        Object.defineProperty(Renderer, '__deserialize__', { value: wrapped, configurable: true, writable: true });
    }
    return true;
}
