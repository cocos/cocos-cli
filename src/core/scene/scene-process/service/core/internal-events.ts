export const InternalServiceEvents = {
    EditorReloadClose: 'editor:reload-close',
    EditorReloadOpen: 'editor:reload-open',
    EditorDisposed: 'editor:disposed',
} as const;

export type InternalServiceEventName = typeof InternalServiceEvents[keyof typeof InternalServiceEvents];
