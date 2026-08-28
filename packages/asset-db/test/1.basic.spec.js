'use strict';

require('chai').should();

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const utils = require('../dist/libs/utils');
const {
    assertNoPathIdentityConflicts,
    createPathRecord,
    PathMap,
    PathSet,
    resolveRealPathCase,
    toPathKey,
} = require('../dist/libs/path-identity');

describe('工具函数', () => {

    it('absolutePath', async function() {
        if (process.platform === 'win32') {
            utils.absolutePath('c:\\Users\\name').should.to.equal('c:\\Users\\name');
            utils.absolutePath('\\Users\\name').should.not.equal('\\Users\\name');
        } else {
            utils.absolutePath('/Users/name').should.to.equal('/Users/name');
            utils.absolutePath('./Users/name').should.not.equal('./Users/name');
        }
    });

    it('compareVersion', async function() {
        utils.compareVersion('1.0.0.2', '1.0.1').should.to.equal(-1);
        utils.compareVersion('0.0.9', '1.0.0').should.to.equal(-1);
        utils.compareVersion('0.9.0', '1.0.0').should.to.equal(-1);
        utils.compareVersion('0.0.0.2', '0.0.0.3').should.to.equal(-1);

        utils.compareVersion('0.0.0', '0.0.0').should.to.equal(0);
        utils.compareVersion('1.1.1', '1.1.1').should.to.equal(0);

        utils.compareVersion('1.0.0', '0.0.0').should.to.equal(1);
        utils.compareVersion('1.0.0', '0.9.0').should.to.equal(1);
        utils.compareVersion('1.0.0', '0.0.9.9').should.to.equal(1);
    });

    it('nameToId', async function() {
        // 是字符串
        (typeof utils.nameToId('1.0.0.2')).should.to.equal('string');
        // 长度 5
        (utils.nameToId('1.0.0.2').length).should.to.equal(5);
    });

    it('isSubPath', async function() {
        if (process.platform === 'win32') {
            utils.isSubPath('c:\\Users\\name', 'c:\\Users\\name').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name\\a', 'c:\\Users\\name').should.to.equal(true);
            utils.isSubPath('c:\\Users\\name', 'c:\\Users\\name\\a').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name', 'c:\\Users2\\name').should.to.equal(false);
            utils.isSubPath('c:\\Users2\\name', 'c:\\Users\\name').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name', 'c:\\Users\\name2').should.to.equal(false);
            utils.isSubPath('c:\\Users\\name2', 'c:\\Users\\name').should.to.equal(false);
        } else {
            utils.isSubPath('/Users/name', '/Users/name').should.to.equal(false);
            utils.isSubPath('/Users/name/a', '/Users/name').should.to.equal(true);
            utils.isSubPath('/Users/name', '/Users/name/a').should.to.equal(false);
            utils.isSubPath('/Users/name', '/Users2/name').should.to.equal(false);
            utils.isSubPath('/Users2/name', '/Users/name').should.to.equal(false);
            utils.isSubPath('/Users/name', '/Users/name2').should.to.equal(false);
            utils.isSubPath('/Users/name2', '/Users/name').should.to.equal(false);
        }
    });

    it('Windows 磁盘路径使用大小写不敏感的 identity key', function() {
        const original = path.join(process.cwd(), 'CaseFolder', 'Asset.TEST');
        const variant = original.toLowerCase();

        if (process.platform === 'win32') {
            toPathKey(original).should.equal(toPathKey(variant));
            toPathKey(original.replace(/\\/g, '/')).should.equal(toPathKey(variant));
            utils.isSamePath(original, variant).should.equal(true);
            utils.isSubPath(path.join(variant, 'Child'), original).should.equal(true);
            toPathKey('\\\\Server\\Share\\CaseFolder\\Asset.TEST')
                .should.equal(toPathKey('\\\\server\\share\\casefolder\\asset.test'));
            toPathKey('\\\\?\\C:\\CaseFolder\\Asset.TEST')
                .should.equal(toPathKey('\\\\?\\c:\\casefolder\\asset.test'));
        } else {
            toPathKey(original).should.not.equal(toPathKey(variant));
            utils.isSamePath(original, variant).should.equal(false);
        }

        toPathKey('db://assets/CaseFolder/Asset.TEST').should.equal('db://assets/CaseFolder/Asset.TEST');
        toPathKey('550E8400-E29B-41D4-A716-446655440000').should.equal('550E8400-E29B-41D4-A716-446655440000');
    });

    it('PathMap 与 PathSet 保留原始 key 并按平台比较路径', function() {
        const original = path.join(process.cwd(), 'CaseFolder', 'Asset.TEST');
        const variant = original.toLowerCase();
        const map = new PathMap([[original, 1]]);
        const set = new PathSet([original]);

        if (process.platform === 'win32') {
            map.get(variant).should.equal(1);
            set.has(variant).should.equal(true);
            map.set(variant, 2);
            set.add(variant);
            map.size.should.equal(1);
            set.size.should.equal(1);
            Array.from(map.keys()).should.deep.equal([variant]);
            Array.from(set.values()).should.deep.equal([variant]);
            Array.from(map.values()).should.deep.equal([2]);
            Array.from(map.entries()).should.deep.equal([[variant, 2]]);
            Array.from(map).should.deep.equal([[variant, 2]]);
            let forEachEntry;
            map.forEach((value, key, owner) => {
                forEachEntry = [key, value, owner === map];
            });
            forEachEntry.should.deep.equal([variant, 2, true]);
            map.delete(original).should.equal(true);
            set.delete(original).should.equal(true);
            map.size.should.equal(0);
            set.size.should.equal(0);
            map.set(original, 3).clear();
            set.add(original).clear();
            map.size.should.equal(0);
            set.size.should.equal(0);
        } else {
            map.has(variant).should.equal(false);
            set.has(variant).should.equal(false);
        }
    });

    it('PathRecord 保持对象访问兼容并支持 Windows 大小写变体', function() {
        const original = path.join(process.cwd(), 'CaseFolder', 'Asset.TEST.meta');
        const variant = original.toLowerCase();
        const record = createPathRecord();
        record[original] = { value: 1 };

        if (process.platform === 'win32') {
            record[variant].value.should.equal(1);
            (variant in record).should.equal(true);
            record[variant] = { value: 2 };
            Object.keys(record).should.deep.equal([variant]);
            JSON.parse(JSON.stringify(record))[variant].value.should.equal(2);
            delete record[original];
            Object.keys(record).should.deep.equal([]);
        } else {
            (record[variant] === undefined).should.equal(true);
        }
    });

    it('Windows 同 identity 的不同扫描路径会明确报错', function() {
        if (process.platform !== 'win32') {
            return;
        }
        const original = path.join(process.cwd(), 'CaseFolder', 'Asset.TEST');
        const variant = path.join(process.cwd(), 'casefolder', 'asset.test');
        (() => assertNoPathIdentityConflicts([original, variant])).should.throw(/Windows path case conflict/);
    });

    it('Windows 增量路径解析会检测大小写敏感目录中的真实冲突', function() {
        if (process.platform !== 'win32') {
            return;
        }

        const root = path.join(process.cwd(), 'case-sensitive-root');
        const originalReaddirSync = fs.readdirSync;
        fs.readdirSync = (directory) => {
            if (utils.isSamePath(directory, root)) {
                return ['A.test', 'a.test'];
            }
            return originalReaddirSync(directory);
        };

        try {
            (() => resolveRealPathCase(path.join(root, 'a.test'), root))
                .should.throw(/Windows path case conflict/);
        } finally {
            fs.readdirSync = originalReaddirSync;
        }
    });

});
