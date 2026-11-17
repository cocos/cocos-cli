import { readFileSync } from 'fs';
import { join } from 'path';
import { globalSetup } from '../../test/global-setup';

describe('legacy effect input attachment bindings', () => {
    beforeAll(async () => { await globalSetup(); });
    it('keeps explicit sampler fallback slots shared with input attachments', () => {
        const compiler = require('../effect-compiler');
        const previous = compiler.options.skipParserTest;
        compiler.options.skipParserTest = true;
        try {
            const content = readFileSync(join(__dirname, '../../../../tests/fixtures/effect-compiler/legacy-subpass-fallback.effect'), 'utf8');
            const result = compiler.buildEffect('legacy-subpass-fallback', content);
            expect(result.shaders[0].subpassInputs.map((input: any) => [input.name, input.binding]))
                .toEqual([['colorInput', 0], ['depthInput', 1]]);
            expect(result.shaders[0].samplerTextures).toEqual([]);
        } finally { compiler.options.skipParserTest = previous; }
    });
    it('continues rejecting arbitrary sparse sampler bindings', () => {
        const compiler = require('../effect-compiler');
        const content = readFileSync(join(__dirname, '../../../../tests/fixtures/effect-compiler/errors/EFX2602.effect'), 'utf8')
            .replaceAll('vec4 test () {}', 'vec4 test () { return vec4(0.0); }');
        const previous = compiler.options.skipParserTest;
        compiler.options.skipParserTest = true;
        try { expect(() => compiler.buildEffect('invalid-sparse-binding', content)).toThrow(/EFX2602/); }
        finally { compiler.options.skipParserTest = previous; }
    });
});
