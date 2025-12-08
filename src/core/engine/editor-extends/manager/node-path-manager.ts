export class NodePathManager {
    private _uuidToPath: Map<string, string> = new Map();          // UUID -> 路径
    private _pathToUuid: Map<string, string> = new Map();          // 路径 -> UUID
    private _nodeNames: Map<string, Map<string, number>> = new Map(); // 父节点UUID -> (节点名 -> 计数)

    /**
        * 清理名称中的非法字符
        */
    private _sanitizeName(name: string): string {
        // 移除或替换路径中的非法字符
        return name.replace(/[\/\\:\*\?"<>\|]/g, '_');
    }

    /**
     * 生成唯一路径
     */
    public generateUniquePath(uuid: string, name: string, parentUuid?: string): string {
        if (!parentUuid) {
            return '';
        }
        const parentPath = parentUuid ? this._uuidToPath.get(parentUuid) || '' : '';

        // 清理名称中的非法路径字符
        const cleanName = this._sanitizeName(name);

        // 检查名称是否唯一，如果不唯一则添加自增后缀
        const finalName = this.ensureUniqueName(parentUuid, cleanName);
        const finalPath = parentPath ? `${parentPath}/${finalName}` : `${finalName}`;

        this.add(uuid, finalPath);

        return finalPath;
    }

    add(uuid: string, path: string) {
        this._uuidToPath.set(uuid, path);
        this._pathToUuid.set(path, uuid);
    }

    remove(uuid: string) {
        const path = this._uuidToPath.get(uuid);
        if (path) {
            this._pathToUuid.delete(path);
        }
        this._uuidToPath.delete(uuid);
        this._nodeNames.delete(uuid);
        const parentUuid = this._getParentUuid(path);
        if (parentUuid && this._nodeNames.has(parentUuid)) {
            const nameMap = this._nodeNames.get(parentUuid)!;
            const nodeName = path ? path.split('/').pop() : undefined;
            if (nodeName) {
                nameMap.delete(nodeName);
            }
        }
    }

    changeUuid(oldUuid: string, newUuid: string) {
        const path = this._uuidToPath.get(oldUuid);
        if (!path) {
            return;
        }
        this._pathToUuid.delete(path);
        this._uuidToPath.delete(oldUuid);
        this._uuidToPath.set(newUuid, path);
        this._pathToUuid.set(path, newUuid);

        if (this._nodeNames.has(oldUuid)) {
            const nameMap = this._nodeNames.get(oldUuid)!;
            this._nodeNames.delete(oldUuid);
            this._nodeNames.set(newUuid, nameMap);
        }
    }

    clear() {
        this._uuidToPath.clear();
        this._pathToUuid.clear();
        this._nodeNames.clear();
    }

    private _getParentUuid(nodePath: string | undefined): string | undefined {
        if (!nodePath) {
            return undefined;
        }
        const parts = nodePath.split('/');
        if (parts.length <= 1) {
            return undefined; // 已经是根节点或没有父节点
        }
        
        // 移除最后一个元素（当前节点），然后重新组合
        const parentPath = parts.slice(0, -1).join('/');
        const parentUuid = parentPath ? this._pathToUuid.get(parentPath) : undefined;
        return parentUuid;
    }

    /**
     * 确保节点名称在父节点下唯一
     */
    ensureUniqueName(parentUuid: string, baseName: string): string {
        if (!this._nodeNames.has(parentUuid)) {
            this._nodeNames.set(parentUuid, new Map());
        }

        const nameMap = this._nodeNames.get(parentUuid)!;

        if (!nameMap.has(baseName)) {
            nameMap.set(baseName, 1);
            return baseName;
        }

        // 名称已存在，添加自增后缀
        let counter = nameMap.get(baseName)! + 1;
        let newName = `${baseName}_${counter}`;

        // 确保新名称也不存在
        while (nameMap.has(newName)) {
            counter++;
            newName = `${baseName}_${counter}`;
        }

        nameMap.set(baseName, counter);
        nameMap.set(newName, 1);

        return newName;
    }

    getNodeUuid(path: string): string | undefined {
        const uuid = this._pathToUuid.get(path);
        return uuid;
    }

    getNodePath(uuid: string): string {
        return this._uuidToPath.get(uuid) || '';
    }

    updateUuid(uuid: string, newName: string, parentUuid?: string) {
        const oldPath = this._uuidToPath.get(uuid);
        // 生成新的唯一路径
        const newPath = this.generateUniquePath(uuid, newName, parentUuid);

        // 更新路径映射
        this._uuidToPath.set(uuid, newPath);
        this._pathToUuid.delete(oldPath!);
        this._pathToUuid.set(newPath, uuid);
    }

    getNameMap(uuid: string): Map<string, number> | null {
        if (!this._nodeNames.has(uuid)) {
            return null;
        }

        return this._nodeNames.get(uuid)!;
    }
}

export default new NodePathManager();
