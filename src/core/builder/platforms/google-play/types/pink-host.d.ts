declare module 'vscode' {
    export class Uri {
        fsPath: string;
        static file(path: string): Uri;
    }
    export namespace window {
        function showOpenDialog(options?: {
            canSelectFiles?: boolean;
            canSelectFolders?: boolean;
            canSelectMany?: boolean;
            filters?: Record<string, string[]>;
            title?: string;
        }): Thenable<Uri[] | undefined>;
    }
    export namespace commands {
        function executeCommand<T = unknown>(command: string, ...args: unknown[]): Thenable<T>;
    }
}
