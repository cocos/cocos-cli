jest.mock('cc', () => ({
    Component: class Component {},
    Node: class Node {},
    GeometryRenderer: class GeometryRenderer {},
    director: {
        getTotalFrames: jest.fn(() => 0),
        tick: jest.fn(),
    },
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: {},
}));

import { EngineService } from '../scene-process/service/engine';
import { Service } from '../scene-process/service/core/decorator';
import { NodeEventType } from '../common';

describe('particle preview refresh after the first selection', () => {
    const particle = { uuid: 'particle-uuid', components: [{ type: 'cc.ParticleSystem2D' }] };
    const other = { uuid: 'other-uuid', components: [] };
    let service: EngineService;
    let selectedPaths: string[];
    let previousCc: unknown;
    let previousSelection: unknown;

    beforeEach(() => {
        previousCc = (globalThis as any).cc;
        previousSelection = Service.Selection;
        selectedPaths = ['Canvas/Particle'];
        (Service as any).Selection = { query: () => selectedPaths };
        (globalThis as any).cc = {
            js: { getClassName: (component: any) => component.type },
            EditorExtends: { Node: {
                getNodeByPath: (path: string) => path === 'Canvas/Particle' ? particle : other,
                getNode: (uuid: string) => uuid === particle.uuid ? particle : other,
            } },
        };
        service = new EngineService();
        service.onSelectionSelect('Canvas/Particle', selectedPaths);
        expect((service as any)._tickInEM).toBe(true);
    });

    afterEach(() => {
        service.onEditorClosed();
        (globalThis as any).cc = previousCc;
        (Service as any).Selection = previousSelection;
    });

    it('keeps simulating when an unrelated node changes after selection', () => {
        service.onNodeChanged(other as any, { type: NodeEventType.SET_PROPERTY });
        expect((service as any)._tickInEM).toBe(true);
    });

    it('does not restart simulation for an unselected particle after clearing selection', () => {
        selectedPaths = [];
        service.onSelectionClear();
        service.onNodeChanged(particle as any, { type: NodeEventType.SET_PROPERTY });
        expect((service as any)._tickInEM).toBe(false);
    });

    it('starts continuous refresh when a particle is added to a selected node', () => {
        service.onSelectionClear();
        service.onComponentAdded({ node: particle, type: 'cc.ParticleSystem2D' } as any);
        expect((service as any)._tickInEM).toBe(true);
    });

    it('keeps refreshing other selected particles when a component is removed', () => {
        selectedPaths.push('Canvas/Other');
        service.onComponentRemoved({ node: other } as any);
        expect((service as any)._tickInEM).toBe(true);
    });
});
