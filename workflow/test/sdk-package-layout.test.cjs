const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('repository package and lockfile have no self dependency or external local link', () => {
    const root = path.resolve(__dirname, '../..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        assert.equal(pkg[section]?.[pkg.name], undefined, 'Package depends on itself');
        assert.deepEqual(lock.packages[''][section], pkg[section], 'Lockfile disagrees with ' + section);
    }
    for (const [name, entry] of Object.entries(lock.packages)) {
        assert(!name.startsWith('../'), 'Lockfile contains external package: ' + name);
        if (entry.link) {
            const relative = path.relative(root, path.resolve(root, entry.resolved));
            assert(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Local link escapes repository: ' + name);
        }
    }
});
