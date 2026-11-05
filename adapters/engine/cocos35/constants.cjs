const fs = require('node:fs');
const path = require('node:path');
module.exports = engine => {
    const legacy = require(require.resolve('@cocos/build-engine/dist/build-time-constants', { paths: [engine] }));
    const values = legacy.setupBuildTimeConstants({ platform: 'HTML5', flags: { DEBUG: true } });
    let location = path.dirname(require.resolve('@cocos/ccbuild'));
    while (!fs.existsSync(path.join(location, 'static/helper-dynamic-constants.txt'))) {
        const parent = path.dirname(location);
        if (parent === location) throw new Error('Compiler dynamic constants helper not found');
        location = parent;
    }
    const helper = fs.readFileSync(path.join(location, 'static/helper-dynamic-constants.txt'), 'utf8');
    const dynamic = new Set([...helper.matchAll(/export\s+(?:const|let)\s+(\w+)/g)].map(match => match[1]));
    return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {
        value, type: typeof value, comment: 'Legacy engine constant',
        internal: false, ccGlobal: true, dynamic: dynamic.has(name),
    }]));
};
