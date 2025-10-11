/**
 *  undo命令基类,业务根据自身需要继承该类,通过重载undo/redo方法完成业务定制
*/
class UndoCommand {
    toPerformUndo = false;

    public async perform() {
        if (this.toPerformUndo) {
            await this.undo();
        } else {
            await this.redo();
        }
    }

    /**
     * 子类根据业务需要，重写该方法,定制undo操作
     */
    async undo() {

    }

    /**
     * 子类根据业务需要，重写该方法,定制redo操作
     */
    async redo() {

    }
}

/** 
 * undo机制基类，用来管理undo队列
*/
class UndoManagerBase {
    _multiCollaboration = true; // 是否支持多人协作
    _multiCommandArray: UndoCommand[] = []; // 多人协作时,undo/redo都是一个独立的命令

    // 步骤控制
    _commandArray: UndoCommand[] = [];
    _index = -1;
    _lastSavedCommand: UndoCommand | null = null;

    /**
     * 添加undo命令
     * @param command:UndoCommand
     */
    push(command: UndoCommand) {
        // undo后插入，要覆盖index后的数据
        if (this._index !== this._commandArray.length - 1) {
            this._commandArray.splice(this._index + 1);
        }

        this._commandArray.push(command);
        if (this._multiCollaboration) {
            this._multiCommandArray.push(command);
        }

        this._index++;
    }

    /**
     * 执行一次undo操作
     */
    async undo(): Promise<UndoCommand | undefined> {
        if (this._index === -1) return;
        const command = this._commandArray[this._index];
        if (command) {
            command.toPerformUndo = true;
            await command.perform();
            this._index--;

            // 将操作命令添加到多人协作的命令队列中
            if (this._multiCollaboration) {
                this._multiCommandArray.push(command);
            }
            return command;
        }
    }

    /**
     * 执行一次redo
     */
    async redo(): Promise<UndoCommand | undefined> {
        if (this._index > this._commandArray.length - 1) return;
        const redoCommand = this._commandArray[this._index + 1];
        if (redoCommand) {
            this._index++;
            redoCommand.toPerformUndo = false;
            await redoCommand.perform();

            if (this._multiCollaboration) {
                this._multiCommandArray.push(redoCommand);
            }
            return redoCommand;
        }
    }

    /**
     * 重置undo队列
     */
    reset() {
        this._commandArray.length = 0;
        this._multiCommandArray.length = 0;
        this._index = -1;
        this._lastSavedCommand = null;
    }

    /**
     * 保存时调用，配合isDirty判断
     */
    save() {
        this._lastSavedCommand = this._commandArray[this._index];
    }

    /**
     * 当返回true时，说明文件存在修改
     * @returns 是否存在修改
     */
    isDirty(): boolean {
        return this._index !== -1 && this._lastSavedCommand !== this._commandArray[this._index];
    }

    /**
     * 合并undo队列中相同group的command为一个操作，注意undo过的command会被丢弃。
     * 在undo队列中索引是group中最后一个command的位置
     * @param group:string 待合并的group名称
     */

}

export { UndoCommand, UndoManagerBase };