'use strict';

// const { expect } = require('chai');

// const fse = require('fs-extra');
// const path = require('path');

// const { MtimeManager } = require('../dist/libs/mtime');

// describe('mtime 管理器', () => {

//     const PATH = {
//         ROOT: path.join(__dirname, './mtime'),
//         JSON: path.join(__dirname, './mtime/backup.json'),
//     };

//     describe('启动一个全新的 Mtime 管理器', async function() {

//         let MTIME;

//         before(async () => {
//             MTIME = new MtimeManager();
//             MTIME.setRecordJSON(PATH.JSON);
//         });

//         after(async () => {
//             await new Promise((resolve) => {
//                 setTimeout(resolve, 600);
//             });

//             // 清空测试数据
//             fse.removeSync(PATH.ROOT);
//         });

//         it('compare & update & remove', async () => {
//             expect(await MTIME.compare('a', '123')).to.equal(false);

//             await MTIME.add('a', '123');

//             expect(await MTIME.compare('a', '123')).to.equal(true);

//             await MTIME.remove('a');

//             expect(await MTIME.compare('a', '123')).to.equal(false);
//         });

//         it('save', async () => {
//             // 延迟 600ms 是因为内存数据延迟 500ms 保存到硬盘
//             await new Promise((resolve) => {
//                 setTimeout(resolve, 600);
//             });
//             expect(fse.existsSync(PATH.JSON)).to.equal(true);
//         });
//     });

//     describe('启动一个有缓存数据的 Mtime 管理器', async function() {

//         let MTIME;

//         before(async () => {
//             fse.outputJSONSync(PATH.JSON, {
//                 'a': '123',
//             });
//             MTIME = new MtimeManager();
//             MTIME.setRecordJSON(PATH.JSON);
//         });

//         after(async () => {
//             await new Promise((resolve) => {
//                 setTimeout(resolve, 600);
//             });

//             // 清空测试数据
//             fse.removeSync(PATH.ROOT);
//         });

//         it('compare & update & remove', async () => {
//             expect(await MTIME.compare('a', '123')).to.equal(true);

//             await MTIME.add('a', '123');

//             expect(await MTIME.compare('a', '123')).to.equal(true);

//             await MTIME.remove('a');

//             expect(await MTIME.compare('a', '123')).to.equal(false);
//         });

//         it('save', async () => {
//             // 延迟 600ms 是因为内存数据延迟 500ms 保存到硬盘
//             await new Promise((resolve) => {
//                 setTimeout(resolve, 600);
//             });
//             expect(fse.existsSync(PATH.JSON)).to.equal(true);
//         });
//     });
// });