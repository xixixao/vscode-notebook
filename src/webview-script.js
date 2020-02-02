const progressIndicatorNode = document.getElementById('__progressIndicator');
const cellsNode = document.getElementById('__cells');

let currentRunID = null;
let existingCells = null;
let newCells = [];
let existingCellIndex = 0;

const START_EVENT = 'start';

// Handle the message inside the webview
window.addEventListener('message', event => {
  const message = event.data; // The JSON data our extension sent
  if (message.type !== START_EVENT && message.runID < currentRunID) {
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
        type: 'internal',
        error: 'Unexpected message from [notebook]',
      });
      break;
  }
});

function handleStart(runID) {
  currentRunID = runID;
  showProgress('Starting run #' + runID);
}

function handleError(data) {
  showProgress(
    `Error in step: \`${data.errorType}\`` + `<div>${data.error}</div>`,
  );
}

function handleSaving() {
  showProgress('Saving the compiled notebook');
}

function handleUpdateCell({cell}) {
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

function handleFinished(data) {
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

function considerCellsEqual(existingCell, newCell) {
  return (
    existingCell.comment === newCell.comment ||
    existingCell.content === newCell.content
  );
}

function showProgress(content) {
  progressIndicatorNode.innerHTML = content;
}

function appendCell(cell) {
  cellsNode.append(createCellDOMNode(cell));
}

const cellComponents = ['comment', 'content', 'result'];
function replaceCell(cell, index, existingCell) {
  const existingCellNode = getCellAtIndex(index);
  cellComponents.forEach((component, i) => {
    if (cell[component] !== existingCell[component]) {
      existingCellNode.children[i].innerHTML = cell[component];
    }
  });
}

function insertCell(cell, cellIndex) {
  cellsNode.insertBefore(createCellDOMNode(cell), getCellAtIndex(cellIndex));
}

function removeCell(cellNode) {
  cellsNode.removeChild(cellNode);
}

function getCellAtIndex(cellIndex) {
  return cellsNode.children[cellIndex];
}

function createCellDOMNode(cell) {
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

function createElementFromHTML(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString;
  return div.firstChild;
}
