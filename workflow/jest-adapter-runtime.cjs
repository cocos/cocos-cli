const Runtime = require('jest-runtime').default;

// Jest 29 shares a Resolver between test files, but its module-ID cache does
// not include the virtual-mock map in its key. Real engine suites register cc
// virtually; later mocked suites can otherwise inherit incompatible module IDs.
module.exports = class AdapterRuntime extends Runtime {
    constructor(config, environment, resolver, ...args) {
        if (!resolver._moduleMap) throw new Error('Unsupported Jest resolver: adapter tests require a per-suite module map');
        super(config, environment, Runtime.createResolver(config, resolver._moduleMap), ...args);
    }
};
