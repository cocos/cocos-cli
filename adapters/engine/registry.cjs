const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const protocolVersion = 1;
class EngineAdapterError extends Error {
    constructor(code, message) { super(message); this.name = 'EngineAdapterError'; this.code = code; }
}
class EngineBackendRegistry {
    constructor() { this.adapters = new Map(); }
    register(adapter) {
        if (!adapter || adapter.protocolVersion !== protocolVersion) throw new EngineAdapterError('ENGINE_ADAPTER_PROTOCOL_MISMATCH', 'Unsupported EngineBackendAdapter protocol');
        if (typeof adapter.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(adapter.id) || !semver.valid(adapter.implementationVersion)
            || !['implemented', 'experimental', 'discovery-only'].includes(adapter.runtimeSupport)
            || !['supports', 'runtime', 'compile', 'inspect', 'validateRuntime'].every(key => typeof adapter[key] === 'function')) {
            throw new EngineAdapterError('ENGINE_ADAPTER_INVALID', 'Invalid EngineBackendAdapter contract');
        }
        if (this.adapters.has(adapter.id)) throw new EngineAdapterError('ENGINE_ADAPTER_DUPLICATE', 'Duplicate engine adapter: ' + adapter.id);
        this.adapters.set(adapter.id, Object.freeze({ ...adapter }));
    }
    resolve(selection, adapterId) {
        if (typeof selection?.version !== 'string' || selection.version.trim() !== selection.version || !/^\d/.test(selection.version) || !semver.valid(selection.version)) throw new EngineAdapterError('ENGINE_VERSION_INVALID', 'Invalid engine SemVer');
        const matches = [...this.adapters.values()].filter(adapter => (!adapterId || adapter.id === adapterId) && adapter.supports(selection.version));
        if (!matches.length) throw new EngineAdapterError('ENGINE_ADAPTER_NOT_FOUND', 'No adapter for engine ' + selection.version + (adapterId ? ' (' + adapterId + ')' : ''));
        if (matches.length > 1) throw new EngineAdapterError('ENGINE_ADAPTER_AMBIGUOUS', 'Multiple adapters match engine ' + selection.version + ': ' + matches.map(adapter => adapter.id).join(', '));
        return matches[0];
    }
}
function createEngineBackendRegistry() {
    const registry = new EngineBackendRegistry();
    registry.register(require('./cocos4/index.cjs'));
    registry.register(require('./cocos38/index.cjs'));
    registry.register(require('./cocos37/index.cjs'));
    registry.register(require('./cocos36/index.cjs'));
    registry.register(require('./cocos35/index.cjs'));
    const create3 = require('./cocos3-discovery.cjs');
    for (let minor = 0; minor <= 8; minor++) registry.register(create3(minor));
    return registry;
}
const registry = createEngineBackendRegistry();
function getEngineBackendAdapter(selection) {
    if (typeof selection?.path !== 'string' || !selection.path.trim()) throw new EngineAdapterError('ENGINE_PATH_INVALID', 'Engine path is required');
    const file = path.join(selection.path, 'engine-sdk.json');
    let metadata;
    if (fs.existsSync(file)) {
        metadata = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new EngineAdapterError('ENGINE_ADAPTER_INVALID', 'Invalid Engine SDK metadata');
        if (metadata.adapterProtocolVersion !== undefined && metadata.adapterProtocolVersion !== protocolVersion) throw new EngineAdapterError('ENGINE_ADAPTER_PROTOCOL_MISMATCH', 'Engine SDK requires an unsupported adapter protocol');
        if (metadata.adapterId !== undefined && (typeof metadata.adapterId !== 'string' || !metadata.adapterId)) throw new EngineAdapterError('ENGINE_ADAPTER_INVALID', 'Invalid SDK adapterId');
    }
    return registry.resolve(selection, metadata?.adapterId);
}
function inspectEngineBackend(selection, policy) {
    try {
        const adapter = getEngineBackendAdapter(selection);
        return { id: adapter.id, protocolVersion, implementationVersion: adapter.implementationVersion,
            runtimeSupport: adapter.runtimeSupport, ...adapter.inspect(selection, policy), errors: [] };
    } catch (error) {
        return { id: null, protocolVersion, runtimeSupport: 'unsupported', validation: 'discovery-only', runtimeInterfaces: 'not-tested',
            layout: null, capabilities: {}, errors: [{ code: error.code || 'ENGINE_ADAPTER_INVALID', message: error.message }] };
    }
}
module.exports = { protocolVersion, EngineAdapterError, EngineBackendRegistry, createEngineBackendRegistry, getEngineBackendAdapter, inspectEngineBackend };
