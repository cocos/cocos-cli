const { runCommand, logTitle } = require('./utils');

(async () => {
    logTitle('Npm run build');
    await runCommand('npm', ['run', 'build']);
})();
