import { join } from "path";
import { projectManager } from "./launcher";

// 这是测试代码，不能使用单元测试，因为 jest 会捕获 require 然后不走 preload 的特殊处理,导致读不了 cc
(async () => {
    const { engine, project } = require('../.user.json');
    await projectManager.open(project || join(__dirname, 'tests/fixtures/projects/asset-operation'), engine)
})();
