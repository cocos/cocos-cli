const { ProcessRPC } = require('../../../../../dist/core/scene/process-rpc');

class NodeService {
    async createNode(name) {
        return `Node:${name}`;
    }

    async longTask() {
        // 延迟500ms，用于测试timeout
        return new Promise((resolve) => setTimeout(() => resolve('done'), 500));
    }

    async ping() {
        return 'pong';
    }
}

const rpc = new ProcessRPC();
rpc.attach(process, 'Test:RPCWorkerSelf');

// 注册对象实例
rpc.register({
    node: new NodeService(),
    scene: {
        async loadScene(id) {
            return id === 'Level01';
        },
    }
});
