import { gradientDump } from '../scene-process/service/dump/types/gradient-dump';

class Gradient {
    public mode = 0;
    public alphaKeys: AlphaKey[] = [];
    public colorKeys: ColorKey[] = [];
}

class AlphaKey {
    public time = 0;
    public alpha = 0;
}

class Color {
    constructor(
        public r: number,
        public g: number,
        public b: number,
        public a = 255,
    ) {}
}

class ColorKey {
    public time = 0;
    public color = new Color(0, 0, 0);
}

describe('gradient dump', () => {
    const globalScope = globalThis as typeof globalThis & { cc?: unknown };
    const originalCC = globalScope.cc;

    beforeAll(() => {
        const classes = {
            'cc.Gradient': Gradient,
            'cc.AlphaKey': AlphaKey,
            'cc.ColorKey': ColorKey,
            'cc.Color': Color,
        };
        globalScope.cc = {
            js: {
                getClassByName: (name: keyof typeof classes) => classes[name],
            },
        };
    });

    afterAll(() => {
        if (originalCC === undefined) {
            delete globalScope.cc;
            return;
        }
        globalScope.cc = originalCC;
    });

    it.each([
        ['Blend', 0],
        ['Fixed', 1],
    ])('restores the %s mode and gradient keys', (_name, mode) => {
        const data: Record<string, Gradient> = {};

        gradientDump.decode(data, { key: 'gradient' }, {
            value: {
                mode,
                alphaKeys: [{ time: 0.25, alpha: 128 }],
                colorKeys: [{ time: 0.75, color: [12, 34, 56, 78] }],
            },
        });

        expect(data.gradient).toMatchObject({
            mode,
            alphaKeys: [{ time: 0.25, alpha: 128 }],
            colorKeys: [{ time: 0.75, color: { r: 12, g: 34, b: 56, a: 78 } }],
        });
    });

    it('keeps the engine default mode for legacy dumps without mode', () => {
        const data: Record<string, Gradient> = {};

        gradientDump.decode(data, { key: 'gradient' }, {
            value: {
                alphaKeys: [],
                colorKeys: [],
            },
        });

        expect(data.gradient.mode).toBe(0);
    });
});
