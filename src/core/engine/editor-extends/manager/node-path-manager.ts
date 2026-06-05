import { formatUniqueName } from './path-utils';

export class NodePathManager {
    private _uuidToPath: Map<string, string> = new Map();          // UUID -> 路径
    private _pathToUuid: Map<string, string> = new Map();          // 路径 -> UUID
    private _lowerPathToUuids: Map<string, Set<string>> = new Map(); // 小写路径 -> UUID集合
    private _nodeNames: Map<string, Set<string>> = new Map(); // 父节点UUID -> 节点名集合

    /**
        * 清理名称中的非法字符
        */
    private _sanitizeName(name: string): string {
        // 移除或替换路径中的非法字符
        return name.replace(/[/\\:*?"<>|]/g, '_');
    }

    /**
     * 生成唯一路径
     */
    public generateUniquePath(uuid: string, name: string, parentUuid?: string): string {
        if (!parentUuid) {
            return '';
        }
        const parentPath = this._uuidToPath.get(parentUuid) || '';

        // 清理名称中的非法路径字符
        const cleanName = this._sanitizeName(name);

        // 检查名称是否唯一，如果不唯一则添加自增后缀
        const finalName = this.ensureUniqueName(parentUuid, cleanName);
        const finalPath = parentPath ? `${parentPath}/${finalName}` : `${finalName}`;

        this.add(uuid, finalPath);

        return finalPath;
    }

    private _addPathMapping(uuid: string, path: string) {
        this._uuidToPath.set(uuid, path);
        this._pathToUuid.set(path, uuid);
        const lowerPath = path.toLowerCase();
        if (!this._lowerPathToUuids.has(lowerPath)) {
            this._lowerPathToUuids.set(lowerPath, new Set());
        }
        this._lowerPathToUuids.get(lowerPath)!.add(uuid);
    }

    private _removePathMapping(uuid: string, path: string | undefined) {
        if (!path) {
            return;
        }
        this._pathToUuid.delete(path);
        const lowerPath = path.toLowerCase();
        const uuids = this._lowerPathToUuids.get(lowerPath);
        if (uuids) {
            uuids.delete(uuid);
            if (uuids.size === 0) {
                this._lowerPathToUuids.delete(lowerPath);
            }
        }
    }

    add(uuid: string, path: string) {
        this._addPathMapping(uuid, path);
    }

    remove(uuid: string) {
        const path = this._uuidToPath.get(uuid);
        this._removePathMapping(uuid, path);
        this._uuidToPath.delete(uuid);
        this._nodeNames.delete(uuid);
        const parentUuid = this._getParentUuid(path);
        if (parentUuid && this._nodeNames.has(parentUuid)) {
            const nameSet = this._nodeNames.get(parentUuid)!;
            const nodeName = path ? path.split('/').pop() : undefined;
            if (nodeName) {
                nameSet.delete(nodeName);
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
        const lowerPath = path.toLowerCase();
        if (!this._lowerPathToUuids.has(lowerPath)) {
            this._lowerPathToUuids.set(lowerPath, new Set());
        }
        this._lowerPathToUuids.get(lowerPath)!.add(newUuid);

        if (this._nodeNames.has(oldUuid)) {
            const nameMap = this._nodeNames.get(oldUuid)!;
            this._nodeNames.delete(oldUuid);
            this._nodeNames.set(newUuid, nameMap);
        }
    }

    clear() {
        this._uuidToPath.clear();
        this._pathToUuid.clear();
        this._lowerPathToUuids.clear();
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
    ensureUniqueName(parentUuid: string | undefined, baseName: string): string {
        const uuid = parentUuid || '';
        if (!this._nodeNames.has(uuid)) {
            this._nodeNames.set(uuid, new Set());
        }

        const nameSet = this._nodeNames.get(uuid)!;

        if (!nameSet.has(baseName)) {
            nameSet.add(baseName);
            return baseName;
        }

        // 从 _001 开始扫描，复用已删除的名称
        let counter = 1;
        let newName = formatUniqueName(baseName, counter);

        while (nameSet.has(newName)) {
            counter++;
            newName = formatUniqueName(baseName, counter);
        }

        nameSet.add(newName);

        return newName;
    }

    getNodeUuid(path: string): string | undefined {
        const result = this.getNodeResult(path);
        return result.uuid;
    }

    getNodeResult(path: string): { uuid?: string; exactMatch?: boolean; error?: 'Not found' | 'Ambiguous' } {
        const result = this._pathToUuid.get(path);
        if (result) {
            return { uuid: result, exactMatch: true };
        }
        const lowerPath = path.toLowerCase();
        const uuids = this._lowerPathToUuids.get(lowerPath);

        if (!uuids || uuids.size === 0) {
            return { error: 'Not found' };
        }

        if (uuids.size > 1) {
            return { error: 'Ambiguous' };
        }

        const uuid = uuids.values().next().value;
        const exactMatch = this._pathToUuid.get(path) === uuid;
        return { uuid, exactMatch };
    }

    getNodePath(uuid: string): string {
        return this._uuidToPath.get(uuid) || '';
    }
    move(uuid: string, name: string, newParentUuid: string | undefined, oldParentUuid?: string): string {
        const oldPath = this._uuidToPath.get(uuid);
        if (!oldPath) {
            return '';
        }

        const parentPath = newParentUuid ? (this._uuidToPath.get(newParentUuid) || '') : '';
        const oldName = oldPath.split('/').pop();
        const cleanName = this._sanitizeName(name);
        const subtreeEntries = Array.from(this._uuidToPath.entries())
            .filter(([, path]) => path === oldPath || path.startsWith(`${oldPath}/`));

        for (const [entryUuid, path] of subtreeEntries) {
            this._removePathMapping(entryUuid, path);
        }

        if (oldParentUuid) {
            const oldNameSet = this._nodeNames.get(oldParentUuid);
            if (oldNameSet && oldName) {
                oldNameSet.delete(oldName);
            }
        }

        const finalName = this.ensureUniqueName(newParentUuid, cleanName);
        const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;

        for (const [entryUuid, path] of subtreeEntries) {
            const suffix = path === oldPath ? '' : path.slice(oldPath.length);
            this._addPathMapping(entryUuid, `${newPath}${suffix}`);
        }

        return newPath;
    }


    updateUuid(uuid: string, newName: string, parentUuid?: string) {
        const oldPath = this._uuidToPath.get(uuid);
        // 生成新的唯一路径
        const newPath = this.generateUniquePath(uuid, newName, parentUuid);

        // 更新路径映射
        this._uuidToPath.set(uuid, newPath);
        this._pathToUuid.delete(oldPath!);
        this._pathToUuid.set(newPath, uuid);

        const oldLowerPath = oldPath!.toLowerCase();
        const oldUuids = this._lowerPathToUuids.get(oldLowerPath);
        if (oldUuids) {
            oldUuids.delete(uuid);
            if (oldUuids.size === 0) {
                this._lowerPathToUuids.delete(oldLowerPath);
            }
        }

        const newLowerPath = newPath.toLowerCase();
        if (!this._lowerPathToUuids.has(newLowerPath)) {
            this._lowerPathToUuids.set(newLowerPath, new Set());
        }
        this._lowerPathToUuids.get(newLowerPath)!.add(uuid);
    }

    getNameSet(uuid: string): Set<string> | null {
        if (!this._nodeNames.has(uuid)) {
            return null;
        }

        return this._nodeNames.get(uuid)!;
    }
}

export default new NodePathManager();
