import nodeManager from '../../3d/manager/node';
import { UndoCommand, UndoManagerBase } from './base';
import dumpUtil from '../dump/index';
import { EventSourceType } from '../../public/event-enum';
import { IComponent, INode, IScene } from '../../../../@types/private';
declare const cce: any;

interface ISceneUndoOption {
    // undo 命令的描述

    tag?: string;
    // 是否自动在每帧结束时记录差异，默认为 true

    auto?: boolean;
    // 自定义undo命令
    customCommand?: SceneUndoCommand;
    //
    external?: object;
}

interface ISceneUndoManager extends UndoManagerBase {
    init(): void;
    beginRecording(uuid: string|string[], option?: ISceneUndoOption): string;
    endRecording(id: string): boolean;
    cancelRecording(id: string): boolean;

    // 待废弃接口
    updateDump(uuid: string[], force?: boolean): void;
    snapshot(command?: any): void;
    //hack: dumpImmediately 为 true 表示 record 的时候直接记录 dump 数据到缓存中，默认为 true
    record(uuid?: string, dumpImmediately?: boolean): void;
    abort(): void;
}

type IDump = INode | IScene | IComponent | null;
type SceneUndoCommandID = string;
/**
 * 场景的 undo 命令类型，与 SceneUndoManager 搭配使用

 */
class SceneUndoCommand extends UndoCommand {
    /**
     * tag: string 命令操作描述，会有默认值 `modify ${target.uuid}`
     */
    public tag = '';

    id: SceneUndoCommandID = '';
    /**
     * @zh 是否在每帧渲染后自动结束记录，默认为true,调用后不需要再调用endRecord;自动命令会按照创建的时间来入栈
     * @en
     */
    auto = false;//

    /**
     * @zh 自定义命令标志，默认false,会自动收集targets的数据作为undo/redo数据
     */
    custom = false;

    /**
     * @zh undo命令设置数据的目标，注意这里可能要用uuid，不然持有节点会导致内存泄露
     */
    uuids: string[] = [];

    // 保存自动记录的数据
    undoData: Map<string, IDump> = new Map();
    redoData: Map<string, IDump> = new Map();

    async undo() {
        await this.applyData(this.undoData);
    }

    async applyData(data: Map<string, IDump>) {
        for (const [uuid, dump] of data) {
            const node = cce.Node.query(uuid);
            if (node ) {
                if (dump) {
                    // console.log('undo节点数据', node.name);
                    await dumpUtil.restoreNode(node, dump);
                    cce.Node.emit('change', node, { source: EventSourceType.UNDO });
                }
            } else {
                const comp = cce.Component.query(uuid);
                if (comp && dump) {
                    const compDump = dump as IComponent;
                    // console.log('undo组件数据', comp.name);
                    for (const key in compDump.value) {
                        await dumpUtil.restoreProperty(comp, key, compDump.value[key]);
                    }
                    cce.Node.emit('change', comp.node, { source: EventSourceType.UNDO });
                }
            }
        }
    }

    async redo() {
        await this.applyData(this.redoData);
    }
}

/**
 * 场景撤销还原管理类
 * 问题:
 * 1. snapshot 接口如何实现，目前想要记录，必须操作proxies，感觉写起来还是不太方便;
 * 需要nodeManager耦合起来
*/
class SceneUndoManager extends UndoManagerBase implements ISceneUndoManager {
    _autoCommands: SceneUndoCommand[] = [];
    _manualCommands: SceneUndoCommand[] = [];
    _uuidDumpMap: Record<string, IDump> = {};
    id = 0;

    // 记录变动的 node.uuid
    records: string[] = [];

    init() {
        cce.Engine.on('onEditorTick', () => {
            this._recordTargetAtFrameEnd();
        });
    }

    _createCommand(option: ISceneUndoOption): SceneUndoCommand {
        let command = null;
        if (option.customCommand) {
            command = option.customCommand;
            command.custom = true;
        } else {
            command = new SceneUndoCommand();
        }

        option.tag !== undefined && (command.tag = option.tag);
        option.auto !== undefined && (command.auto = option.auto);
        if (command.auto !== false) {
            this._autoCommands.push(command);
        } else {
            this._manualCommands.push(command);
        }
        this.id++;
        command.id = command.tag + this.id;
        return command;
    }

    _isCommandExist(command: SceneUndoCommand) {
        return this._commandArray.indexOf(command) !== -1;
    }

    // 每帧结束时的自动记录
    _recordTargetAtFrameEnd() {
        if (this._autoCommands.length > 0) {
            this._autoCommands.forEach((command: SceneUndoCommand) => {
                // console.log('自动记录', command.id);
                this.endRecording(command.id);
            });
            this._autoCommands.length = 0;
        }
    }

    _setUndo(command: SceneUndoCommand, uuid: string) {
        let undo = null;

        const node = cce.Node.query(uuid);
        if (node) {
            undo = dumpUtil.dumpNode(node);
        } else {
            const comp = cce.Component.query(uuid);
            undo = comp ? dumpUtil.dumpComponent(comp) : null;
        }
        this._uuidDumpMap[uuid] = undo;

        command.undoData.set(uuid, undo);
    }

    _setRedo(command: SceneUndoCommand, uuid: string) {
        let redo = null;
        const node = cce.Node.query(uuid);
        if (node) {
            redo = dumpUtil.dumpNode(node);
        } else {
            const comp = cce.Component.query(uuid);
            redo = comp ? dumpUtil.dumpComponent(comp) : null;
        }
        this._uuidDumpMap[uuid] = redo;
        command.redoData.set(uuid, redo);
    }

    /**
    * undo系统开启记录target,调用后会记录当前target的属性
    * @param uuids {string | string[]} 需要记录的目标，Node 或者 component

    *@param option :ISceneUndoOption 记录undo数据的选项
    *@return SceneUndoCommand
    */
    beginRecording(uuids: string | string[], option?: ISceneUndoOption): SceneUndoCommandID {
        option = option ?? { auto: false };
        const newCommand = this._createCommand(option);
        uuids = Array.isArray(uuids) ? uuids : [uuids];
        // remove duplicate target
        const uuidSet = new Set(uuids);
        for (const uuid of uuidSet.values()) {
            newCommand.uuids.push(uuid);
            if (!newCommand.custom) {
                // console.log('记录undo数据', uuid);
                this._setUndo(newCommand, uuid);
            }
        }
        return newCommand.id;
    }

    _removeCommand(list: SceneUndoCommand[], commandID: SceneUndoCommandID): boolean {
        const command = list.find(t => t.id === commandID);
        if (command) {
            const index = list.indexOf(command);
            if (index !== -1) {
                list.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    /**
     * @zh 取消自动记录的命令，如果命令已经入栈，需要取出,
     *     每帧结束会自动入栈，异步使用时，可能会发生cancel时已经入栈的问题
     * @param command beginRecording返回的SceneUndoCommand
     */
    cancelRecording(id: SceneUndoCommandID): boolean {
        let suc = this._removeCommand(this._autoCommands, id);
        if (!suc) {
            suc = this._removeCommand(this._manualCommands, id);
        }
        return suc;
    }

    /**
     * 结束记录
     * @param id beginRecording返回的SceneUndoCommandID
     * @returns
     */
    endRecording(id: SceneUndoCommandID): boolean {
        const command = this._autoCommands.find(t => t.id === id) ?? this._manualCommands.find(t => t.id === id);
        if (!command) return false;
        if (this._isCommandExist(command)) {
            console.warn('command is already exist', command.tag);
            return false;
        }
        if (!command.custom) {
            command.uuids.forEach(t => {
                this._setRedo(command as SceneUndoCommand, t);
            });
        }
        // set tag with all target's name
        if (command.tag === '') {
            const targetNames = command.uuids.map(uuid => {
                return cce.Node.query(uuid)?.name || cce.Component.query(uuid)?.name;
            }).join(' ');
            command.tag = `modify:${targetNames}`;
        }
        this.push(command);
        // remove from manualCommands
        const index = this._manualCommands.indexOf(command);
        if (index !== -1) {
            this._manualCommands.splice(index, 1);
        }
        // dump数据，不包含子节点数据，所以需要更新node-change里的数据
        // this.updateDump(this.records);
        // 说明改变的可能比记录的多，要排查是否漏记录
        if (this.records.length > command.uuids.length) {
            console.debug('records length > command uuids length', this.records, command.uuids);
        }
        this.records.length = 0;
        return true;
    }

    reset() {
        // console.log('scene undo reset');
        super.reset();
        this._autoCommands.length = 0;
        this._manualCommands.length = 0;
        this._uuidDumpMap = {};
        // if (uuids) {
        //     this._uuidDumpMap = {};
        //     uuids.forEach(uuid => {
        //         const node = cce.Node.query(uuid);
        //         if (node) {
        //             this._uuidDumpMap[uuid] = dumpUtil.dumpNode(node);
        //         }
        //     });
        // }
    }

    // 兼容老接口
    _getUndoData(uuids: string[] = this.records) {
        const result: Map<string, IDump> = new Map();
        uuids.forEach((uuid: string) => {
            result.set(uuid, this._uuidDumpMap[uuid]);
        });
        return result;
    }

    _getRedoData(uuids: string[] = this.records) {
        // 更新缓存，输出新数据
        this.updateDump(uuids);
        return this._getUndoData(uuids);
    }

    updateDump(uuids: string[] = [], force = true) {
        uuids.forEach((uuid) => {
            try {
                const node = nodeManager.query(uuid);
                if (!node || node.objFlags & cc.Object.Flags.HideInHierarchy) {
                    return;
                }
                if (force || !this._uuidDumpMap[uuid]) {
                    this._uuidDumpMap[uuid] = nodeManager.queryDumpAtAll(uuid);
                }
            } catch (error) {
                console.error(error);
            }
        });
    }

    async undo(): Promise<UndoCommand|undefined> {
        const command = await super.undo() as SceneUndoCommand|undefined;
        if (command && !command.custom) {
            // 更新dump数据
            this.updateDump(command.uuids);
        }
        cce.Engine.repaintInEditMode();
        return command;
    }

    async redo(): Promise<UndoCommand|undefined> {
        const command = await super.redo() as SceneUndoCommand|undefined;
        if (command && !command.custom) {
            // 更新dump数据
            this.updateDump(command.uuids);
        }
        cce.Engine.repaintInEditMode();
        return command;
    }
    /**
     * 兼容老接口，通过before-node-change更新dump数据（避免以前的一股脑对所有节点进行快照）
     * node-change时，会记录records,当用户发起snapshot时，会根据records记录变化数据。
     * records会在endRecording时清空,这里是为了避免由于兼容老街口导致的快照了冗余的数据。
     * @returns
     */
    snapshot() {
        try {
            const undoData = this._getUndoData(); // 旧数据
            const redoData = this._getRedoData(); // 新数据
            this.records.length = 0;

            if (JSON.stringify(Array.from(undoData.entries())) === JSON.stringify(Array.from(redoData.entries()))) {
                return false;
            }

            const command = new SceneUndoCommand();
            command.undoData = undoData;
            command.redoData = redoData;
            const undoID = this.beginRecording(command.uuids, { customCommand: command});
            this.endRecording(undoID);
        } catch (error) {
            console.error(error);
        }
    }

    abort() {
        this.records.length = 0;
    }

    /**
     * 记录节点 dump 数据
     * hack: dumpImmediately 为 true 表示 record 的时候直接记录 dump 数据到缓存中，默认为 true
     * @param node
     * @param dumpImmediately 默认为 true，只有自己传过来是 false 的时候才不记录（这个字段目前只有 Animation-scene-facade 新建动画剪辑时会用到）
     */
    record(node: string, dumpImmediately = true) {
        if (!this.records.includes(node)) {
            //todo: 这边是新增逻辑，需要持续观察下是否有问题，
            // 在这边增加是因为打开场景的时候所有节点的变化会马上被记录，
            // 但是没有对比数据是否有修改，导致打开 prefab 在 restore 回 scene 的时候，
            // 可能会导致 dirty 的 flag 错误
            dumpImmediately && this.updateDump([node]);
            this.records.push(node);
        }
    }
}

export { SceneUndoManager, SceneUndoCommand, SceneUndoCommandID, ISceneUndoOption, ISceneUndoManager };
