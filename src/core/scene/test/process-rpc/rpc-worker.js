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

    async addReferenceImage(path) {
        const dataUrl = await rpc.request('referenceImageFiles', 'readDataUrl', [path]);
        return { path, dataUrl };
    }
}

const rpc = new ProcessRPC();
rpc.attach({
    send: (msg) => process.send(msg),
    on: (event, cb) => process.on(event, cb),
    process,
});

const nodeService = new NodeService();

// 注册对象实例
rpc.register({
    node: nodeService,
    scene: {
        async loadScene(id) {
            return id === 'Level01';
        },
        async addReferenceImage(path) {
            return nodeService.addReferenceImage(path);
        },
    }
});
