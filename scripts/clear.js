import fs from 'fs-extra';
import ps from 'path';
(async () => await fs.emptyDir(ps.join(__dirname, '..', 'dist')))();
