'use strict';

const { expect } = require('chai');

const fse = require('fs-extra');
const path = require('path');

const { DependencyManager, getAssociatedFiles } = require('../dist/libs/dependency');

describe('Dependency 管理器', () => {

    const PATH = {
        ROOT:path.join(__dirname, './depend'),
        JSON: path.join(__dirname, './depend/backup.json'),
    };


    let  DEPEND1;
    let  DEPEND2;

    before(async () => {
        DEPEND1 = new DependencyManager(console, PATH.ROOT);
        await DEPEND1.setRecordJSON(PATH.JSON);
        DEPEND2 = new DependencyManager(console, PATH.ROOT);
        await DEPEND2.setRecordJSON(PATH.JSON);
    });

    after(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 600);
        });

        // 清空测试数据
        fse.removeSync(PATH.ROOT);
    });

    it('注册依赖关系', async () => {
        expect(getAssociatedFiles('a')).to.deep.equals([]);

        // 设置 a 依赖 a1 以及 a2
        DEPEND1.add('uuid', 'a', ['a1', 'a2']);

        expect(getAssociatedFiles('a1')).to.deep.equal(['a']);
        expect(getAssociatedFiles('a2')).to.deep.equal(['a']);
    });

    it('重复设置依赖', async () => {
        expect(getAssociatedFiles('b')).to.deep.equals([]);

        DEPEND1.add('uuid', 'b', ['b1', 'b2']);
        DEPEND1.add('uuid', 'b', ['b1', 'b2']);

        expect(getAssociatedFiles('b1')).to.deep.equal(['b']);
        expect(getAssociatedFiles('b2')).to.deep.equal(['b']);
    });

    it('删除依赖关系', async () => {
        expect(getAssociatedFiles('b')).to.deep.equals([]);

        DEPEND1.add('uuid', 'c', ['c1', 'c2']);

        expect(getAssociatedFiles('c1')).to.deep.equal(['c']);
        expect(getAssociatedFiles('c2')).to.deep.equal(['c']);

        DEPEND1.remove('uuid', 'c');

        expect(getAssociatedFiles('c1')).to.deep.equal([]);
        expect(getAssociatedFiles('c2')).to.deep.equal([]);
    });

    it('多管理器共存', async () => {
        expect(getAssociatedFiles('d')).to.deep.equals([]);

        DEPEND1.add('uuid', 'd', ['d1', 'd2']);
        DEPEND2.add('uuid', 'e', ['e1', 'e2']);

        expect(getAssociatedFiles('d1')).to.deep.equal(['d']);
        expect(getAssociatedFiles('d2')).to.deep.equal(['d']);
        expect(getAssociatedFiles('e1')).to.deep.equal(['e']);
        expect(getAssociatedFiles('e2')).to.deep.equal(['e']);
    });

    it('Windows 缓存中的大小写重复路径依赖会安全去重', async () => {
        if (process.platform !== 'win32') {
            return;
        }

        const cacheRoot = path.join(PATH.ROOT, 'case-cache');
        const cacheFile = path.join(cacheRoot, 'dependency.json');
        const source = path.join(cacheRoot, 'Source.test');
        const dependency = path.join(cacheRoot, 'Dependency.test');
        fse.outputJSONSync(cacheFile, {
            version: DependencyManager.version,
            data: {
                path: {
                    'Source.test': ['Dependency.test', 'dEPENDENCY.TEST'],
                },
                uuid: {},
            },
        }, { spaces: 2 });

        const manager = new DependencyManager(console, cacheRoot);
        await manager.setRecordJSON(cacheFile);

        expect(getAssociatedFiles(dependency.toLowerCase())).to.deep.equal([source]);
        expect(() => manager.remove('path', source.toLowerCase())).to.not.throw();
        expect(getAssociatedFiles(dependency)).to.deep.equal([]);
        manager.destroy();
    });

    it('销毁管理器', async () => {
        DEPEND1.destroy();
        expect(getAssociatedFiles('d1')).to.deep.equal([]);
        expect(getAssociatedFiles('d2')).to.deep.equal([]);
        expect(getAssociatedFiles('e1')).to.deep.equal(['e']);
        expect(getAssociatedFiles('e2')).to.deep.equal(['e']);
    });

});
