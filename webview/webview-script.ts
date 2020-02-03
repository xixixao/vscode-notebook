export type NotebookPublishEvent =
  | {type: 'start'}
  | {type: 'saving'}
  | {type: 'updateCell'; data: NotebookCellData}
  | {type: 'finished'}
  | {type: 'error'; data: NotebookCellError};

export type NotebookCellData = {
  comment?: string;
  content?: string;
  result?: string;
};

export type NotebookCellError = {
  error: any;
  errorType: NotebookCellErrorType;
};

export type NotebookCellErrorType =
  | 'compilation'
  | 'saving'
  | 'runtime'
  | 'internal';

type CellIndex = number;
type RunID = number;

const progressIndicatorNode = document.getElementById('__progressIndicator')!;
const cellsNode = document.getElementById('__cells')!;

let currentRunID: RunID | null = null;
let cells: Array<NotebookCellData> = [];
let cellIndex = 0;

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
      handleFinished();
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
  cellIndex = 0;
}

function handleError(data: NotebookCellError) {
  showError(
    `${formatError(data.errorType)}
${data.error.message ?? data.error}
${data.error.stacktrace ?? ''}`,
  );
}

function formatError(errorType: NotebookCellErrorType) {
  switch (errorType) {
    case 'compilation':
      return 'An error occured when compiling your Notebook:';
    case 'saving':
      return 'An error occured when saving your Notebook:';
    case 'runtime':
      return 'An error occured when running your compiled Notebook:';
    case 'internal':
      return 'An internal error occured:';
  }
}

function handleSaving() {
  showProgress('Saving the compiled notebook');
}

function handleUpdateCell(cell: NotebookCellData) {
  showProgress('Updating cells');
  console.log('Handling update', cell);

  const existingCell = cells == null ? null : cells[cellIndex];
  if (existingCell == null) {
    console.log(cellIndex, 'appending');

    appendCell(cell);
  } else {
    if (considerCellsEqual(existingCell, cell)) {
      console.log(cellIndex, 'replacing');

      replaceCell(cell, cellIndex, existingCell);
    } else {
      console.log(cellIndex, 'inserting');

      insertCell(cell, cellIndex);
    }
  }
  cellIndex++;
}

function handleFinished() {
  showProgress(`Finished running notebook.`);
  removeStaleCells();
}

function removeStaleCells() {
  const numCells = cellsNode.children.length;
  for (let i = numCells - 1; i >= cellIndex; i--) {
    removeCell(getCellAtIndex(i), i);
  }
}

function considerCellsEqual(
  existingCell: NotebookCellData,
  newCell: NotebookCellData,
) {
  console.log(existingCell, newCell);
  return (
    existingCell.comment === newCell.comment ||
    existingCell.content === newCell.content
  );
}

function showProgress(content: string) {
  if (true) {
    // TODO: Switch this off/put it behind a flag
    progressIndicatorNode.innerHTML = `<div class="__success">${content}</div>`;
  }
}

function showError(content: string) {
  progressIndicatorNode.innerHTML = `<div class="__error">${content}</div>`;
}

function appendCell(cell: NotebookCellData) {
  cellsNode.append(createCellDOMNode(cell));
  cells.push(cell);
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
  cells[index] = cell;
}

function insertCell(cell: NotebookCellData, cellIndex: CellIndex) {
  cellsNode.insertBefore(createCellDOMNode(cell), getCellAtIndex(cellIndex));
  cells.splice(cellIndex, 0, cell);
}

function removeCell(cellNode: Node, cellIndex: CellIndex) {
  cellsNode.removeChild(cellNode);
  cells.splice(cellIndex, 1);
}

function getCellAtIndex(cellIndex: CellIndex) {
  return cellsNode.children[cellIndex];
}

function createCellDOMNode(cell: NotebookCellData) {
  // NOTE: Lack of whitespace around interpolations is important because
  // of applying white-space: pre and pre-line in CSS
  return createElementFromHTML(
    `<div class="__cell">
      <div class="__cellComment">${cell.comment}</div>
      <div class="__cellContent">${cell.content}</div>
      <div class="__cellResult">${cell.result}</div>
    </div>`,
  );
}

function createElementFromHTML(htmlString: string) {
  var div = document.createElement('div');
  div.innerHTML = htmlString;
  return div.firstChild!;
}
