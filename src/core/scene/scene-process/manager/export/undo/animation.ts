'use strict';

import animationManager from '../../3d/manager/animation';
import { UndoManagerBase, UndoCommand } from './base';
import { ISceneUndoManager, ISceneUndoOption, SceneUndoCommandID } from './scene';

class AnimationUndoManager extends UndoManagerBase implements ISceneUndoManager {

    name = 'animation';
    id = 0;
    _manualCommands: AnimationUndoCommand[] = [];

    nodeUuid = ''; // 当前正在编辑的节点
    clipUuid = ''; // 当前正在编辑的动画
    clipDump: any = null; // 缓存的上一步动画数据
    init() {

    }
    getUndoData() {
        return {
            nodeUuid: this.nodeUuid,
            clipUuid: this.clipUuid,
            clipDump: this.clipDump,
        };
    }

    getRedoData() {
        this.updateCache();
        return this.getUndoData();
    }

    updateCache() {
        this.clipDump = animationManager.dumpClip(this.nodeUuid, this.clipUuid);
    }

    _createCommand(option: ISceneUndoOption): AnimationUndoCommand {
        const command = new AnimationUndoCommand();
        option.tag !== undefined && (command.tag = option.tag);
        this.id++;
        command.id = this.name + this.id;
        this._manualCommands.push(command);
        return command;
    }

    // 动画编辑模式下,只需要记录动画操作的undo,通过external来判断
    beginRecording(uuids: string | string[], option?: ISceneUndoOption): SceneUndoCommandID {
        if (uuids === this.nodeUuid && option?.external && Object.prototype.hasOwnProperty.call(option.external, 'animation')) {
            const command = this._createCommand({tag: 'animation edit'});
            command.undoData = this.getUndoData();
            return command.id;
        }
        return '';
    }

    endRecording(id: string) {
        const command = this._manualCommands.find(t => t.id === id);
        if (!command) return false;        
        // remove from manualCommands
        const index = this._manualCommands.indexOf(command);
        if (index !== -1) {
            this._manualCommands.splice(index, 1);
        }
        command.redoData = this.getRedoData();
        if (JSON.stringify(command.undoData) === JSON.stringify(command.redoData)) {
            return false;
        }
        this.push(command);
        return false;
    }

    cancelRecording(id: string) {
        const command = this._manualCommands.find(t => t.id === id);
        if (!command) return false;        
        // remove from manualCommands
        const index = this._manualCommands.indexOf(command);
        if (index !== -1) {
            this._manualCommands.splice(index, 1);
        }
        return true;
    }

    reset(nodeUuid?: string, clipUuid?: string) {
        // 动画编辑模式下修改脚本也会触发 scene 的 reload 此时的 reset 参数不匹配，不操作
        if (typeof nodeUuid !== 'string' || typeof clipUuid !== 'string') {
            return;
        }
        super.reset();
        this.nodeUuid = nodeUuid;
        this.clipUuid = clipUuid;
        this.updateCache();
    }

    // 动画编辑不需要实现snapshot,已经完成了替换
    snapshot(command?: any): void {
        
    }

    record(uuid?: string | undefined): void {
        
    }

    abort(): void {
        
    }
    updateDump(uuids: string[]) {

    }

    async undo(): Promise<UndoCommand|undefined> {
        const command = await super.undo() as AnimationUndoCommand|undefined;
        if (command ) {
            this.updateCache();
        }
        return command;
    }

    async redo(): Promise<UndoCommand|undefined> {
        const command = await super.redo() as AnimationUndoCommand|undefined;
        if (command ) {
            this.updateCache();
        }
        return command;
    }
}

class AnimationUndoCommand extends UndoCommand {
    id = '';
    undoData: any;
    redoData: any;
    public tag = '';
    public async undo(): Promise<void> {
        await this.applyData(this.undoData);
    }

    public async redo(): Promise<void> {
        await this.applyData(this.redoData);
    }

    async applyData(data: any) {
        const { nodeUuid, clipUuid, clipDump } = data;

        try {
            await animationManager.restoreFromDump(nodeUuid, clipUuid, clipDump);
        } catch (error) {
            console.error(error);
        }
    }
}

export {AnimationUndoManager};
