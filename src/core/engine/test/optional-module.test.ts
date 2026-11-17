import { optionalEngineModule, unavailableEngineFeature } from '../optional-module';
jest.mock('cc/editor/optional-fixture', () => ({ value: 42 }), { virtual: true });
jest.mock('cc/editor/broken-fixture', () => { throw Object.assign(new Error("Cannot find module 'missing-dependency'\nRequire stack: cc/editor/broken-fixture"), { code: 'MODULE_NOT_FOUND' }); }, { virtual: true });
describe('optional engine editor modules', () => {
    it('loads available exports', () => { expect(optionalEngineModule('cc/editor/optional-fixture', () => require('cc/editor/optional-fixture'))).toEqual({ value: 42 }); });
    it('returns unavailable for an absent module', () => { expect(optionalEngineModule('cc/editor/absent-fixture', () => require('cc/editor/absent-fixture'))).toBeUndefined(); });
    it('propagates missing dependencies inside an available module', () => { expect(() => optionalEngineModule('cc/editor/broken-fixture', () => require('cc/editor/broken-fixture'))).toThrow('missing-dependency'); });
    it('provides a recognizable capability error', () => { expect(unavailableEngineFeature('embedded players')).toMatchObject({ code: 'ENGINE_CAPABILITY_UNAVAILABLE' }); });
});
