'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('Release package entry', () => {
    it('loads the dist package entry after release', () => {
        const pkg = require(path.join(__dirname, '..', 'dist'));

        expect(pkg).to.be.an('object');
        expect(pkg.AssetDB).to.be.a('function');
        expect(pkg.AssetActionEnum).to.be.an('object');
        expect(pkg.create).to.be.a('function');
        expect(pkg.nameToId).to.be.a('function');
        expect(pkg.queryPath).to.be.a('function');
        expect(pkg.setFileSystemProvider).to.be.a('function');
        expect(pkg.Utils).to.be.an('object');
    });

    it('keeps the workspace private and emits no inline source payload', () => {
        const root = path.join(__dirname, '..');
        const packageJson = require(path.join(root, 'package.json'));
        const indexJs = fs.readFileSync(path.join(root, 'dist', 'index.js'), 'utf8');

        expect(packageJson.private).to.equal(true);
        expect(packageJson.scripts).not.to.have.property('publish');
        expect(packageJson.scripts).not.to.have.property('publish:npm');
        expect(indexJs).not.to.include('sourceMappingURL=data:application/json');
    });
});
