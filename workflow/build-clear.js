const fse = require('fs-extra');
const path = require('path');
(async () => await fse.emptyDir(path.join(__dirname, '..', 'dist')))();
