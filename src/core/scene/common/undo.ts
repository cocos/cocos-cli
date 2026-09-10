export interface IUndoScope {
    assetUuid?: string;
    assetUrl?: string;
    nodePath?: string;
    propPath?: string;
    editorType?: 'scene' | 'prefab' | 'animation' | string;
    mode?: 'general' | 'prefab' | 'animation' | 'preview' | string;
}

export interface IUndoCommandMeta {
    id: string;
    label: string;
    type: string;
    scope: IUndoScope;
    timestamp: number;
}

export interface IUndoRedoResult {
    success: boolean;
    commandId?: string;
    label?: string;
    reason?: string;
}

export interface IUndoOperationOptions {
    scope?: Partial<IUndoScope>;
}

export interface IUndoCheckpoint {
    commandId: string | null;
    generation: number;
    /** 当游标回到 checkpoint 之前时，是否将 checkpoint 所在命令计入差异。 */
    includeCheckpointCommand?: boolean;
}

export interface IUndoPushWithPreviousOptions {
    label?: string;
    type: string;
    scope: IUndoScope;
    previousScope?: Partial<IUndoScope>;
    previousTypes?: string[];
}

export interface IUndoCommand {
    meta: IUndoCommandMeta;
    undo(): Promise<IUndoRedoResult>;
    redo(): Promise<IUndoRedoResult>;
}

export interface IUndoGroupOptions {
    label?: string;
}

/** beginRecording 的选项。 */
export interface IUndoBeginOptions {
    /** 展示在 undo 历史 UI 里的名称。 */
    label?: string;
    /** 兼容旧调用点的别名，后续逐步迁移到 label。 */
    tag?: string;
    /** 可选的命令作用域；用于上层在提交后做 scoped undo/吸收判断。 */
    scope?: IUndoScope;
    /**
     * 自定义可撤销命令，内部自带 undo()/redo() 逻辑。
     * 传入后会跳过默认的属性快照模式，直接使用这个命令。
     */
    customCommand?: IUndoCommand;
}

export interface IUndoService {
    /**
     * 开始记录指定对象的属性快照。
     * 返回的 commandId 需要传给 endRecording / cancelRecording。
     */
    beginRecording(uuids: string[], options?: IUndoBeginOptions): string;

    /**
     * 将 commandId 对应的录制结果提交到 undo 栈。
     * 如果 dirty 状态发生变化，会触发 dirty:changed。
     */
    endRecording(commandId: string): Promise<void>;

    /**
     * 丢弃 commandId 对应的录制结果，不推入 undo 栈。
     */
    cancelRecording(commandId: string): void;

    /** 撤销最近一条可撤销命令。 */
    undo(options?: IUndoOperationOptions): Promise<IUndoRedoResult>;

    /** 重做最近撤销的一条命令。 */
    redo(options?: IUndoOperationOptions): Promise<IUndoRedoResult>;

    beginGroup(options?: IUndoGroupOptions): string;

    endGroup(groupId: string): IUndoRedoResult;

    cancelGroup(groupId: string): IUndoRedoResult;

    isGroupActive(): boolean;

    /** 业务 service 显式推入可撤销命令的内部入口。 */
    push(command: IUndoCommand): void;

    /** 将新命令与紧邻栈顶的连续匹配命令合并；栈顶不匹配时退化为普通 push，不跨过不匹配命令搜索历史栈。 */
    pushWithPrevious(command: IUndoCommand, options: IUndoPushWithPreviousOptions): void;

    /** 清空整个 undo/redo 栈，内部生命周期 API。 */
    reset(): void;

    /** 清空整个 undo/redo 栈。 */
    clearHistory(): void;

    /** 当前场景有未保存变更时返回 true。 */
    isDirty(): boolean;

    /** 记录当前 undo cursor，用于业务层判断某个编辑 session 内的 scoped dirty。 */
    createCheckpoint(): IUndoCheckpoint;

    /** 当前 cursor 和 checkpoint 之间存在匹配 scope 的命令差异时返回 true。 */
    hasScopedDifference(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean;

    /** 当前 cursor 与 checkpoint 之间存在匹配 scope 的 session 差异时返回 true；可按 checkpoint 标记包含其所在命令。 */
    hasScopedDifferenceAfterCheckpoint(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean;

    /** 丢弃 checkpoint 之后匹配 scope 的命令，同时保留不匹配 scope 的命令及其当前状态。 */
    discardScopedChangesAfterCheckpoint(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): Promise<IUndoRedoResult>;

    /** 当前 cursor 和 checkpoint 之间存在不匹配 scope 的命令差异时返回 true。 */
    hasDifferenceOutsideScope(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean;

    /** 至少有一条可撤销命令时返回 true。 */
    canUndo(options?: IUndoOperationOptions): boolean;

    /** 至少有一条可重做命令时返回 true。 */
    canRedo(options?: IUndoOperationOptions): boolean;

    /**
     * 将当前 undo 栈位置标记为已保存状态。
     * 调用后 isDirty() 会立即返回 false。
     */
    markSaved(): void;

    /**
     * 当前存在进行中的录制时返回 true。
     * 传入 uuid 时，只有该 uuid 被某个录制覆盖才返回 true。
     */
    hasActiveRecording(uuid?: string): boolean;

    /** undo/redo 正在应用命令时返回 true。 */
    isApplying(): boolean;
}

export interface IRedoService {
    /** 重做最近撤销的一条命令。 */
    redo(options?: IUndoOperationOptions): Promise<IUndoRedoResult>;

    /** 至少有一条可重做命令时返回 true。 */
    canRedo(options?: IUndoOperationOptions): boolean;
}

/** 给外部代理过滤层使用的公开接口，只保留对外 API，刻意排除内部修改辅助方法。 */
export type IPublicUndoService = Omit<
    IUndoService,
    | 'reset'
    | 'push'
    | 'pushWithPrevious'
    | 'isApplying'
    | 'redo'
    | 'canRedo'
    | 'beginRecording'
    | 'endRecording'
    | 'cancelRecording'
    | 'hasActiveRecording'
>;

/** 给外部代理过滤层使用的公开 redo 命名空间。 */
export type IPublicRedoService = IRedoService;

export interface IUndoEvents {
    'undo:changed': [];
    /** isDirty() 状态翻转时触发，事件参数是新的 dirty 值。 */
    'dirty:changed': [dirty: boolean];
}
