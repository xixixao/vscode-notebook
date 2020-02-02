export type NotebookPublishEvent =
  | {type: 'start'}
  | {type: 'saving'}
  | {type: 'updateCell'; data: NotebookCellData}
  | {type: 'finished'; data: NotebookRunFinishData}
  | {type: 'error'; data: NotebookCellError};

export type NotebookCellData = {
  comment?: string;
  content?: string;
  result?: string;
};

export type NotebookCellError = {
  error: any;
  errorType: 'compilation' | 'saving' | 'output' | 'internal';
};

export type NotebookRunFinishData = {success: boolean; code: number};

type CellIndex = number;
type RunID = number;

const progressIndicatorNode = document.getElementById('__progressIndicator')!;
const cellsNode = document.getElementById('__cells')!;

let currentRunID: RunID | null = null;
let existingCells: Array<NotebookCellData> | null = null;
let newCells: Array<NotebookCellData> = [];
let existingCellIndex = 0;

const START_EVENT = 'start';

console.log('Notebook webview script initialized');

// Handle the message inside the webview
window.addEventListener('message', event => {
  const message = event.data; // The JSON data our extension sent
  if (
    currentRunID != null &&
    message.type !== START_EVENT &&
    message.runID < currentRunID
  ) {
    // This is a stale update
    return;
  }
  switch (message.type) {
    case START_EVENT:
      handleStart(message.runID);
      break;
    case 'saving':
      handleSaving();
      break;
    case 'updateCell':
      handleUpdateCell(message.data);
      break;
    case 'finished':
      handleFinished(message.data);
      break;
    case 'error':
      handleError(message.data);
      break;
    default:
      handleError({
        errorType: 'internal',
        error: 'Unexpected message from [notebook]',
      });
      break;
  }
});

function handleStart(runID: RunID) {
  currentRunID = runID;
  showProgress('Starting run #' + runID);
}

function handleError(data: NotebookCellError) {
  showProgress(
    `Error in step: \`${data.errorType}\`` + `<div>${data.error}</div>`,
  );
}

function handleSaving() {
  showProgress('Saving the compiled notebook');
}

function handleUpdateCell(cell: NotebookCellData) {
  showProgress('Updating cells');
  newCells.push(cell);
  const existingCell =
    existingCells == null ? null : existingCells[existingCellIndex];
  if (existingCell == null) {
    appendCell(cell);
  } else {
    if (considerCellsEqual(existingCell, cell)) {
      console.log(existingCellIndex);
      replaceCell(cell, existingCellIndex, existingCell);
      existingCellIndex++;
    } else {
      insertCell(cell, existingCellIndex);
    }
  }
}

function handleFinished(data: NotebookRunFinishData) {
  showProgress(`Process finished with code \`${data.code}\``);
  removeStaleCells();
  existingCells = newCells;
  newCells = [];
  existingCellIndex = 0;
}

function removeStaleCells() {
  const numCells = cellsNode.children.length;
  for (let i = newCells.length; i < numCells; i++) {
    removeCell(getCellAtIndex(i));
  }
}

function considerCellsEqual(
  existingCell: NotebookCellData,
  newCell: NotebookCellData,
) {
  return (
    existingCell.comment === newCell.comment ||
    existingCell.content === newCell.content
  );
}

function showProgress(content: string) {
  progressIndicatorNode.innerHTML = content;
}

function appendCell(cell: NotebookCellData) {
  cellsNode.append(createCellDOMNode(cell));
}

const cellComponents: Array<keyof NotebookCellData> = [
  'comment',
  'content',
  'result',
];
function replaceCell(
  cell: NotebookCellData,
  index: CellIndex,
  existingCell: NotebookCellData,
) {
  const existingCellNode = getCellAtIndex(index);
  cellComponents.forEach((component, i) => {
    if (cell[component] !== existingCell[component]) {
      existingCellNode.children[i].innerHTML = cell[component] ?? '';
    }
  });
}

function insertCell(cell: NotebookCellData, cellIndex: CellIndex) {
  cellsNode.insertBefore(createCellDOMNode(cell), getCellAtIndex(cellIndex));
}

function removeCell(cellNode: Node) {
  cellsNode.removeChild(cellNode);
}

function getCellAtIndex(cellIndex: CellIndex) {
  return cellsNode.children[cellIndex];
}

function createCellDOMNode(cell: NotebookCellData) {
  return createElementFromHTML(
    `<div class="__cell">
      <div class="__cellComment">
        ${cell.comment}
      </div>
      <div class="__cellContent">${cell.content}</div>
      <div class="__cellResult">
        ${cell.result}
      </div>
    </div>`,
  );
}

function createElementFromHTML(htmlString: string) {
  var div = document.createElement('div');
  div.innerHTML = htmlString;
  return div.firstChild!;
}
