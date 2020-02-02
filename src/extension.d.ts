import * as vscode from 'vscode';
export declare type NotebookCellData = {
    comment?: string;
    content?: string;
    result?: string;
};
export declare function activate(context: vscode.ExtensionContext): void;
export declare function deactivate(): void;
