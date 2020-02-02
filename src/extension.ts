import * as vscode from 'vscode';
import * as notebookPackage from './notebook/index';
import * as path from 'path';
import {spawn as nodeSpawn, SpawnOptionsWithoutStdio} from 'child_process';
import {continueStatement} from '@babel/types';
import * as fs from 'fs';

type NotebookID = string;
type NotebookRunID = number;
type NotebookInstance = {
  id: NotebookID;
  displayPanel: vscode.WebviewPanel;
  lastRunID?: NotebookRunID | undefined;
};

type NotebookRegistry = {
  lookupNotebookInstance(id: NotebookID): NotebookInstance | undefined;
  registerNotebookInstance(notebookInstance: NotebookInstance): void;
  disposeNotebookInstance(notebookInstance: NotebookInstance): void;
};
type NotebookDisposeHandler = (
  registerNotebookDisposal: (
    disposeNotebook: (notebookInstance: NotebookInstance) => void,
  ) => vscode.Disposable,
) => void;

type NotebookDisplayTemplate = {
  html: string;
  scriptPath: vscode.Uri;
};

// Potentially configurable in the future
const shouldPreserveFocusWhenOpeningNotebook = true;

export function activate(context: vscode.ExtensionContext) {
  const notebookRegistry = createNotebookRegistry();

  const registerExtensionSubscription = (disposable: vscode.Disposable) => {
    context.subscriptions.push(disposable);
  };

  const notebookContentWithPlaceholder = getNotebookContentWithPlaceholder(
    context,
  );

  registerOpenNotebookCommand(
    notebookRegistry,
    registerExtensionSubscription,
    notebookContentWithPlaceholder,
  );
  registerOnSaveHandler(notebookRegistry, registerExtensionSubscription);
  registerOnCloseHandler(notebookRegistry, registerExtensionSubscription);
}

// this method is called when your extension is deactivated
export function deactivate() {}

function createNotebookRegistry(): NotebookRegistry {
  const notebookRegistry: Map<NotebookID, NotebookInstance> = new Map();

  return {
    lookupNotebookInstance(id) {
      return notebookRegistry.get(id);
    },

    registerNotebookInstance(notebookInstance) {
      notebookRegistry.set(notebookInstance.id, notebookInstance);
    },

    disposeNotebookInstance(notebookInstance) {
      notebookRegistry.delete(notebookInstance.id);
    },
  };
}

function registerOpenNotebookCommand(
  notebookRegistry: NotebookRegistry,
  registerExtensionSubscription: (disposable: vscode.Disposable) => void,
  notebookContentWithPlaceholder: NotebookDisplayTemplate,
) {
  debugLog('[notebook] Activated.');

  // Command is declared in `package.json`
  registerExtensionSubscription(
    vscode.commands.registerCommand('extension.openNotebook', () => {
      const notebookSourceEditor = checkValidNotebookSourceIsOpen();
      if (notebookSourceEditor == null) {
        return;
      }
      const viewColumnForNotebookDisplay = getViewColumnForNotebookDisplay(
        notebookSourceEditor,
      );
      const notebookID = getNotebookIDForEditor(notebookSourceEditor.document);
      const notebookInstance = notebookRegistry.lookupNotebookInstance(
        notebookID,
      );

      if (notebookInstance != null) {
        revealExistingNotebook(notebookInstance, viewColumnForNotebookDisplay);
      } else {
        const newNotebookInstance = openNewNotebook(
          notebookID,
          notebookSourceEditor,
          notebookContentWithPlaceholder,
          viewColumnForNotebookDisplay,
          registerNotebookDisposal => {
            registerExtensionSubscription(
              registerNotebookDisposal(
                notebookRegistry.disposeNotebookInstance,
              ),
            );
          },
        );
        notebookRegistry.registerNotebookInstance(newNotebookInstance);
      }
    }),
  );
}

// TODO: remove
let i = 0;

function checkValidNotebookSourceIsOpen() {
  const {activeTextEditor} = vscode.window;
  if (activeTextEditor == null) {
    showInfoMessage('You need to have a notebook open.');
    return null;
  }
  if (activeTextEditor.document.isUntitled) {
    showInfoMessage('You need to save your notebook first.');
    return null;
  }

  return activeTextEditor;
}

function showInfoMessage(text: string) {
  vscode.window.showInformationMessage('[Notebook Extension]: ' + text);
}

function getNotebookIDForEditor(notebookSourceDocument: vscode.TextDocument) {
  return notebookSourceDocument.fileName;
}

function getViewColumnForNotebookDisplay(
  notebookSourceEditor: vscode.TextEditor,
) {
  const viewColumnOfNoteBookSource =
    notebookSourceEditor.viewColumn ?? vscode.ViewColumn.One;
  return viewColumnOfNoteBookSource + 1;
}

function getNotebookDisplayPanelTitle(notebookSourceEditor: vscode.TextEditor) {
  const {name} = path.parse(notebookSourceEditor.document.fileName);
  return name;
}

function openNewNotebook(
  notebookID: NotebookID,
  notebookSourceEditor: vscode.TextEditor,
  notebookContentWithPlaceholder: NotebookDisplayTemplate,
  viewColumn: vscode.ViewColumn,
  disposeHandler: NotebookDisposeHandler,
) {
  const displayPanel = createNotebookDisplay(
    notebookSourceEditor,
    notebookContentWithPlaceholder,
    viewColumn,
  );
  const notebookInstance = {id: notebookID, displayPanel};
  handleNotebookDisplayPanelClosing(notebookInstance, disposeHandler);

  debugLog(`[notebook] Opened \`${notebookInstance.id}\`.`);
  return notebookInstance;
}

function createNotebookDisplay(
  notebookSourceEditor: vscode.TextEditor,
  notebookContentWithPlaceholder: NotebookDisplayTemplate,
  viewColumn: vscode.ViewColumn,
) {
  const webviewType = 'notebookDisplay'; // TODO: What is this used for?
  const panel = vscode.window.createWebviewPanel(
    webviewType,
    getNotebookDisplayPanelTitle(notebookSourceEditor),
    {
      preserveFocus: shouldPreserveFocusWhenOpeningNotebook,
      viewColumn,
    },
    {
      enableScripts: true, // JS
      retainContextWhenHidden: true, // Don't kill it when backgrounding
    },
  );
  initializeNotebookDisplayWithHTML(
    panel.webview,
    notebookContentWithPlaceholder,
  );

  return panel;
}

function initializeNotebookDisplayWithHTML(
  displayWebview: vscode.Webview,
  {html, scriptPath}: NotebookDisplayTemplate,
) {
  const scriptUri = displayWebview.asWebviewUri(scriptPath);
  displayWebview.html = html.replace('webview-script.js', scriptUri.toString());
}

function getNotebookContentWithPlaceholder(context: vscode.ExtensionContext) {
  const webviewSourceFilePath = context.asAbsolutePath(
    'src/webview-source.html',
  );
  const scriptPath = vscode.Uri.file(
    context.asAbsolutePath('src/webview-script.js'),
  );
  const html = fs.readFileSync(webviewSourceFilePath, 'utf8');
  return {html, scriptPath};
}

function handleNotebookDisplayPanelClosing(
  notebookInstance: NotebookInstance,
  disposeHandler: NotebookDisposeHandler,
) {
  disposeHandler(disposeNotebookInstance =>
    notebookInstance.displayPanel.onDidDispose(() => {
      debugLog(`[notebook] Closed \`${notebookInstance.id}\`.`);
      disposeNotebookInstance(notebookInstance);
    }),
  );
}

function revealExistingNotebook(
  notebookInstance: NotebookInstance,
  viewColumn: vscode.ViewColumn,
) {
  notebookInstance.displayPanel.reveal(
    viewColumn,
    shouldPreserveFocusWhenOpeningNotebook,
  );
}

function registerOnSaveHandler(
  notebookRegistry: NotebookRegistry,
  registerExtensionSubscription: (disposable: vscode.Disposable) => void,
) {
  registerExtensionSubscription(
    vscode.workspace.onDidSaveTextDocument(
      (textDocument: vscode.TextDocument) => {
        const notebookID = getNotebookIDForEditor(textDocument);
        const notebookInstance = notebookRegistry.lookupNotebookInstance(
          notebookID,
        );
        if (notebookInstance != null) {
          compileAndRunNotebook(notebookInstance, textDocument);
        }
      },
    ),
  );
}

function registerOnCloseHandler(
  notebookRegistry: NotebookRegistry,
  registerExtensionSubscription: (disposable: vscode.Disposable) => void,
) {
  registerExtensionSubscription(
    vscode.workspace.onDidCloseTextDocument(
      (textDocument: vscode.TextDocument) => {
        const notebookID = getNotebookIDForEditor(textDocument);
        const notebookInstance = notebookRegistry.lookupNotebookInstance(
          notebookID,
        );
        if (notebookInstance != null) {
          debugLog(`[notebook] Closed source \`${notebookInstance.id}\`.`);
          notebookInstance.displayPanel.dispose();
        }
      },
    ),
  );
}

type NotebookPublishType =
  | 'start'
  | 'saving'
  | 'updateCell'
  | 'finished'
  | 'error';

async function compileAndRunNotebook(
  notebookInstance: NotebookInstance,
  notebookSource: vscode.TextDocument,
) {
  notebookInstance.lastRunID = (notebookInstance.lastRunID ?? 0) + 1;
  const publish = getPublishForNotebookInstance(notebookInstance);

  publish('start');
  const [compiledNotebook, compilationError] = compileNotebook(notebookSource);

  if (compilationError != null) {
    publish('error', {errorType: 'compilation', error: compilationError});
    return;
  }

  const compiledNotebookFileName = getCompiledNotebookFilename(
    notebookSource.fileName,
  );
  publish('saving');
  const savingError = await saveCompiledNotebook(
    compiledNotebookFileName,
    compiledNotebook,
  );
  if (savingError != null) {
    publish('error', {errorType: 'saving', error: savingError});
  }

  runCompiledNotebook(compiledNotebookFileName, {
    onCellUpdate: data => {
      debugLog(data);
      publish('updateCell', data);
    },
    onOutputError: outputError => {
      publish('error', {errorType: 'output', error: outputError});
    },
    onFinished: data => {
      debugLog(
        `[notebook] Run of \`${notebookInstance.id}\` finished with code \`${data.code}\``,
      );
      publish('finished', data);
    },
  });
}

function getPublishForNotebookInstance(notebookInstance: NotebookInstance) {
  const runID = notebookInstance.lastRunID!;
  return (type: NotebookPublishType, data?: Object) => {
    notebookInstance.displayPanel.webview.postMessage({
      runID,
      type,
      data,
    });
  };
}

function compileNotebook(notebookSource: vscode.TextDocument) {
  try {
    return [notebookPackage.compile(notebookSource.getText()), null];
  } catch (e) {
    return [null, e];
  }
}

async function saveCompiledNotebook(
  compiledNotebookFileName: string,
  compiledNotebook: string,
) {
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(compiledNotebookFileName),
    Buffer.from(compiledNotebook),
  );
}

function getCompiledNotebookFilename(sourceFileName: string) {
  const {dir, name, ext} = path.parse(sourceFileName);
  return path.format({dir, name, ext: '.out' + ext});
}

function runCompiledNotebook(
  compiledNotebookFileName: string,
  publish: {
    onCellUpdate: (data: Object) => void;
    onOutputError: (error: any) => void;
    onFinished: (data: {success: boolean; code: number}) => void;
  },
) {
  const spawnedNotebook = spawnCommand(`node ${compiledNotebookFileName}`, {
    cwd: path.dirname(compiledNotebookFileName),
  });

  const {
    cellTag,
    cellContentTag,
    cellResultTag,
    cellEndTag,
  } = notebookPackage.internals;
  const tagsInOrder = [cellTag, cellContentTag, cellResultTag, cellEndTag];
  const tagCount = tagsInOrder.length;
  let cellState = 0;
  let bufferPosition = 0;
  let isCellStateInProgress = false;
  const cellPartsInOrder: Array<'comment' | 'content' | 'result'> = [
    'comment',
    'content',
    'result',
  ];
  const cellData: {
    comment?: string;
    content?: string;
    result?: string;
  } = {};

  function consume(data: string, {onError}: {onError: () => void}) {
    while (bufferPosition < data.length) {
      const tag = tagsInOrder[cellState % tagCount];
      const nextTag = tagsInOrder[(cellState + 1) % tagCount];
      const start = isCellStateInProgress
        ? 0
        : data.indexOf(tag, bufferPosition) + tag.length + 1;
      if (start === -1) {
        publish.onOutputError(
          '[notebook] Could not parse output from running your notebook. This is probably an issue with [notebook]',
        );
        onError();
      }
      const nextStart = data.indexOf(nextTag, start);
      const wasCellStateInProgress = isCellStateInProgress;
      isCellStateInProgress = nextStart === -1;
      const end = isCellStateInProgress ? data.length : nextStart;
      const isBetweenCells = cellState % tagCount === tagCount - 1;
      if (!isBetweenCells) {
        const newData = data.slice(start, end).trim();
        const oldData = cellData[cellPartsInOrder[cellState % tagCount]];
        cellData[
          cellPartsInOrder[cellState % tagCount]
        ] = wasCellStateInProgress ? oldData + newData : newData;
      } else {
        publish.onCellUpdate({cell: cellData});
      }
      bufferPosition = end;
      if (!isCellStateInProgress) {
        cellState++;
      }
    }
    bufferPosition = 0;
  }
  spawnedNotebook.stdout.on('data', outputBuffer => {
    const output = outputBuffer.toString();
    debugLog(output);
    consume(output, {
      onError: () => {
        spawnedNotebook.stdout.destroy();
      },
    });
  });
  spawnedNotebook.on('close', code => {
    publish.onFinished({success: code === 0, code});
  });
}

function spawnCommand(command: string, options: SpawnOptionsWithoutStdio) {
  var file, args;
  if (process.platform === 'win32') {
    file = 'cmd.exe';
    args = ['/s', '/c', '"' + command + '"'];
    options = {...options, windowsVerbatimArguments: true};
  } else {
    file = '/bin/sh';
    args = ['-c', command];
  }
  return nodeSpawn(file, args, options);
}

function debugLog(...args: any[]) {
  if (true) {
    console.log(...args);
  }
}
