const ps = require('path');
const fs = require('fs');
const fsJetpack = require('fs-jetpack');
const { Module } = require('module');

const editorRoot = ps.resolve(__dirname, '../../../../../../../..');
const engineRoot = ps.join(editorRoot, 'resources/3d/engine');
// polyfill some dirty globals
Object.assign(global, {
    Manager: { AssetInfo: { engine: engineRoot } },
    cc: {},
    CC_EDITOR: false,
    CC_DEV: false,
    CC_TEST: false,
});
(Module.createRequire || Module.createRequireFromPath)(ps.resolve(editorRoot, 'app', 'index.js'))('cc/location').set(engineRoot);

const shdcLib = require(ps.resolve(__dirname, '..'));
shdcLib.options.noSource = true;
shdcLib.options.throwOnWarning = true;
shdcLib.options.skipParserTest = true;

// general compiler error unit tests
const errorTests = () => {
    const errorRE = /EFX\d\d\d\d/i;
    const flagRE = /\/\/\s*@efx-([\w-]*)/g;
    return fsJetpack.find(ps.resolve(__dirname, './errors'), { matching: '*.effect', recursive: false }).reduce((acc, file) => {
        const name = ps.basename(file, '.effect');
        const content = fs.readFileSync(file, { encoding: 'utf8' });
        flagRE.lastIndex = 0;
        let cap = flagRE.exec(content);
        while (cap) {
            switch (cap[1]) {
                case 'no-check':
                    return acc;
            }
            cap = flagRE.exec(content);
        }
        try {
            shdcLib.buildEffect(name, content);
            acc.push(`no error reported from ${name}`);
        } catch (e) {
            if (typeof e !== 'string' || e.match(new RegExp(name.match(errorRE)[0], 'g')).length !== 2) {
                acc.push(e);
            }
        }
        return acc;
    }, []);
};

// feature-specific unit tests
const featureTests = () => {
    const spacesRE = /[\s\n]+/g,
        identifierRE = /\w/;
    const replacer = (
        m,
        ofs,
        str, // replace those following or followed by a non-identifier
    ) => (!ofs || !identifierRE.test(str[ofs - 1]) || !identifierRE.test(str[ofs + m.length]) ? '' : ' ');
    const checkRE = /\/\/\s*@check(.*)/g;
    const objEquals = (source, target) => {
        if (Array.isArray(target)) {
            return target.every((t, i) => source && objEquals(source[i], t));
        } else if (typeof target === 'object') {
            return Object.keys(target).every((k) => source && objEquals(source[k], target[k]));
        } else {
            return source === target;
        }
    };
    // expose relevant data structures
    const { UniformBinding } = shdcLib.mappings;
    return fsJetpack.find(__dirname, { matching: '*.effect', recursive: false }).reduce((acc, file) => {
        const name = ps.basename(file, '.effect');
        const content = fs.readFileSync(file, { encoding: 'utf8' });
        try {
            const effect = shdcLib.buildEffect(name, content);
            for (const shader of effect.shaders) {
                shader.glsl1.vert = shader.glsl1.vert.replace(spacesRE, replacer);
                shader.glsl1.frag = shader.glsl1.frag.replace(spacesRE, replacer);
                shader.glsl3.vert = shader.glsl3.vert.replace(spacesRE, replacer);
                shader.glsl3.frag = shader.glsl3.frag.replace(spacesRE, replacer);
                shader.glsl4.vert = shader.glsl4.vert.replace(spacesRE, replacer);
                shader.glsl4.frag = shader.glsl4.frag.replace(spacesRE, replacer);
            }
            checkRE.lastIndex = 0;
            let count = 1,
                cap = checkRE.exec(content);
            while (cap) {
                if (!eval(cap[1])) {
                    acc.push(`${name}.effect check #${count} failed`);
                }
                cap = checkRE.exec(content);
                count++;
            }
        } catch (e) {
            acc.push(e);
        }
        return acc;
    }, []);
};

errorTests().forEach((e) => console.log(e));
featureTests().forEach((e) => console.log(e));
