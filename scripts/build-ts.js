const utils = require('./utils');

(async () => {
    utils.logTitle('Npm run build');
    await utils.runCommand('npm', ['run', 'build']);
})();
