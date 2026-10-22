const mockParticleSystem2D = class {
    enabledInHierarchy = true;
    preview = true;
    active = false;
    resetSystem = jest.fn(() => { this.active = true; });
    // The engine leaves preview-enabled emitters inactive on first focus.
    onFocusInEditor = jest.fn(() => { if (!this.preview) this.resetSystem(); });
    onLostFocusInEditor = jest.fn(() => { this.active = false; });
};

jest.mock('cc', () => ({ __esModule: true, ParticleSystem2D: mockParticleSystem2D }));
jest.mock('../scene-process/service/core/decorator', () => ({ register: () => () => undefined }));
jest.mock('../scene-process/service/utils/editor-node', () => ({
    getEditorNodeUuidByPath: () => 'particle-node',
    getEditorNodeByUuid: () => mockNode,
}));
let mockNode: any;

describe('SelectionService particle preview', () => {
    let selection: any;
    let particle: InstanceType<typeof mockParticleSystem2D>;
    beforeEach(() => {
        const { SelectionService } = require('../scene-process/service/selection');
        selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);
        particle = new mockParticleSystem2D();
        mockNode = { _components: [particle], components: [particle] };
    });

    it('starts an idle preview-enabled emitter on first selection', () => {
        selection.select('Canvas/Particle');
        expect(particle.onFocusInEditor).toHaveBeenCalledTimes(1);
        expect(particle.active).toBe(true);
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('starts again after losing focus without restarting a running emitter', () => {
        particle.active = true;
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).not.toHaveBeenCalled();
        selection.clear();
        expect(particle.active).toBe(false);
        selection.select('Canvas/Particle');
        expect(particle.active).toBe(true);
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('preserves the engine focus behavior when continuous preview is disabled', () => {
        particle.preview = false;
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('does not start disabled emitters', () => {
        particle.enabledInHierarchy = false;
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).not.toHaveBeenCalled();
    });

    it('does not reset unrelated components with similar properties', () => {
        const component = { enabledInHierarchy: true, preview: true, active: false, resetSystem: jest.fn() };
        mockNode = { _components: [component], components: [component] };
        selection.select('Canvas/Particle');
        expect(component.resetSystem).not.toHaveBeenCalled();
    });
});
export {};
