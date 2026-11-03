const semver = require('semver');
const { supportsVersion } = require('./cocos38/compiler.cjs');
/** Each 3.x minor is a separate discovery target, not an assertion of runtime compatibility. */
module.exports = minor => {
    const id = 'cocos-3.' + minor;
    const unavailable = () => { const error = new Error('Adapter ' + id + ' currently supports discovery only; runtime/toolchain adaptation is required'); error.code = 'ENGINE_ADAPTER_NOT_IMPLEMENTED'; throw error; };
    return {
        id, protocolVersion: 1, implementationVersion: '0.1.0', runtimeSupport: 'discovery-only',
        supports: version => { const parsed = semver.parse(version); return parsed?.major === 3 && parsed.minor === minor && !supportsVersion(version); },
        runtime: unavailable, compile: unavailable, validateRuntime: unavailable,
        inspect() {
            const capability = () => ({ status: 'not-implemented', missing: [], reason: 'This engine series is identified but has no verified runtime/toolchain adapter yet' });
            return { validation: 'discovery-only', runtimeInterfaces: 'not-tested', layout: null, capabilities: {
                sourcePreparation: capability(), sceneEditing: capability(), webPreview: capability(), nativeBuild: capability(),
            } };
        },
    };
};
