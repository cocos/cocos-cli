'use strict';

const { expect } = require('chai');

const fse = require('fs-extra');
const path = require('path');

const meta = require('../dist/libs/meta');

describe('Meta 管理器', () => {

    const META_PATH = {
        META1: path.join(__dirname, './meta/root/1.meta'),
        META2: path.join(__dirname, './meta/root/2.meta'),
        META3: path.join(__dirname, './meta/root/3.meta'),
        META4: path.join(__dirname, './meta/root/4.meta'),
    };

    const PATH = {
        ROOT: path.join(__dirname, './meta'),
        DIR: path.join(__dirname, './meta/backup'),
        JSON: path.join(__dirname, './meta/backup.json'),
    };

    describe('启动一个全新的 Meta 管理器', async function () {

        before(() => {
            // 模拟已经存在的 meta
            fse.outputJSONSync(META_PATH.META1, meta.completionMeta({ name: '1' }), { spaces: 2 });
            fse.outputJSONSync(META_PATH.META2, meta.completionMeta({ name: '2' }), { spaces: 2 });
            fse.outputJSONSync(META_PATH.META3, meta.completionMeta({ name: '3' }), { spaces: 2 });
            fse.outputJSONSync(META_PATH.META4, meta.completionMeta({ name: '4' }), { spaces: 2 });
        });

        after(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 600);
            });

            // 清空测试数据
            fse.removeSync(PATH.ROOT);
        });

        const META = new meta.MetaManager();
        // META.setBackupPath(PATH.DIR);
        // META.setRecordJSON(PATH.JSON);

        it('初始化管理器，数据全部为空', async () => {
            // 刚开始没有数据
            expect(META.path2meta[META_PATH.META1]).to.equal(undefined);
            expect(META.path2meta[META_PATH.META2]).to.equal(undefined);
            expect(META.path2meta[META_PATH.META3]).to.equal(undefined);
            expect(META.path2meta[META_PATH.META4]).to.equal(undefined);
        });

        it('read', async () => {
            // read 之后，读取到了数据
            await META.read(META_PATH.META1);
            expect(META.path2meta[META_PATH.META1]).not.equal(undefined);
        });

        it('remove', async () => {
            await META.read(META_PATH.META1);
            await META.read(META_PATH.META2);
            // 确保一开始数据是存在的
            expect(META.path2meta[META_PATH.META1]).not.equal(undefined);
            expect(META.path2meta[META_PATH.META2]).not.equal(undefined);
            // 确保一开始备份数据是空的
            // expect(META.path2backup[META_PATH.META1]).to.equal(undefined);
            // expect(META.path2backup[META_PATH.META2]).to.equal(undefined);

            // 直接执行删除操作
            await META.remove(META_PATH.META1);
            // 内存数据应该不存在
            expect(META.path2meta[META_PATH.META1]).to.equal(undefined);
            // meta 文件应该不存在
            expect(fse.existsSync(META_PATH.META1)).to.equal(false);
            // 内存中的备份数据应该存在
            // expect(META.path2backup[META_PATH.META1]).not.equal(undefined);
            // 备份文件应该存在
            // expect(fse.existsSync(META.path2backup[META_PATH.META1])).to.equal(true);

            // 先删除 meta 在执行删除操作
            fse.removeSync(META_PATH.META2);
            await META.remove(META_PATH.META2);
            // 内存数据应该不存在
            expect(META.path2meta[META_PATH.META2]).to.equal(undefined);
            // meta 文件应该不存在
            expect(fse.existsSync(META_PATH.META2)).to.equal(false);
            // 内存中的备份数据应该不存在
            // expect(META.path2backup[META_PATH.META2]).to.equal(undefined);
        });

        it('get', async () => {
            // 刚开始没有数据
            expect(META.path2meta[META_PATH.META3]).to.equal(undefined);

            // get 之后，读取到了数据
            const info = await META.get(META_PATH.META3);
            expect(META.path2meta[META_PATH.META3]).not.equal(undefined);

            // 保证 meta 已经被删除
            await META.remove(META_PATH.META4);
            // get 一个已经被删除的 meta，应该从备份中还原 meta 文件
            // const backupFile = META.path2backup[META_PATH.META4];
            await META.get(META_PATH.META4);
            // 内存中的 meta 数据应该存在
            expect(META.path2meta[META_PATH.META4]).not.equal(undefined);
            // 内存中的备份数据应该不存在
            // expect(META.path2backup[META_PATH.META4]).to.equal(undefined);
            // 备份文件应该不存在
            // expect(fse.existsSync(backupFile)).to.equal(false);
            // 实际文件应该存在
            expect(fse.existsSync(META_PATH.META4)).to.equal(true);
        });

        it('save', async () => {
            // 延迟 600ms 是因为内存数据延迟 500ms 保存到硬盘
            // await new Promise((resolve) => {
            //     setTimeout(resolve, 600);
            // });
            // expect(fse.existsSync(PATH.JSON)).to.equal(true);
        });
    });

    describe('根据之前的结果重启新的管理器', async () => {

        before(() => {
            // 模拟已经存在的 meta 备份
            fse.outputJSONSync(PATH.JSON, {
                [META_PATH.META1]: path.join(PATH.DIR, 'meta.json'),
            });
            fse.outputJSONSync(path.join(PATH.DIR, 'meta.json'), meta.completionMeta({ name: '1' }, { space: 2 }));
        });

        after(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 600);
            });
            // 清空测试数据
            fse.removeSync(PATH.ROOT);
        });

        // it('恢复备份', async () => {
        //     const META = new meta.MetaManager();
        //     META.setBackupPath(PATH.DIR);
        //     META.setRecordJSON(PATH.JSON);

        //     // 读取不存在的 meta，不应该报错
        //     await META.read(META_PATH.META1);

        //     // 备份文件应该还存在
        //     // expect(META.path2backup[META_PATH.META1]).not.equal(undefined);
        //     // 内存中的 meta 数据应该不存在
        //     expect(META.path2meta[META_PATH.META1]).to.equal(undefined);

        //     // 读取不存在的 meta，不应该报错
        //     await META.get(META_PATH.META1);
        //     // 备份文件应该不存在
        //     // expect(META.path2backup[META_PATH.META1]).to.equal(undefined);
        //     // 内存中的 meta 数据应该存在
        //     expect(META.path2meta[META_PATH.META1]).not.equal(undefined);
        // });

    });
});