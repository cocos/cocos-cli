jest.mock('cc', () => ({ TERRAIN_MAX_LAYER_COUNT: 4 }));
import { registerTerrainSessionResolver, resolveTerrainSession, type TerrainSession } from '../scene-process/service/core/terrain-session';

it('rejects duplicate owners and never falls back when a view rejects a target', () => {
    const target: any = {};
    const data = jest.fn();
    const release = registerTerrainSessionResolver(() => null);
    try {
        expect(() => registerTerrainSessionResolver(() => null)).toThrow('already registered');
        expect(resolveTerrainSession(target, data)).toBeNull();
        expect(data).not.toHaveBeenCalled();
    } finally { release(); release(); }
    const session = { target } as TerrainSession;
    data.mockReturnValue(session);
    expect(resolveTerrainSession(target, data)).toBe(session);
});

it('rejects a resolver that points to another Terrain', () => {
    const release = registerTerrainSessionResolver(() => ({ target: {} } as TerrainSession));
    try { expect(resolveTerrainSession({} as any, jest.fn())).toBeNull(); } finally { release(); }
});
