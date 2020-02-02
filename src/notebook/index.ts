import * as babelParser from '@babel/parser';
import traverse, {NodePath} from '@babel/traverse';
import generate from '@babel/generator';

import * as js from 'babel-types';

export function compile(source: string): string {
  const ast = babelParser.parse(source);
  traverse(ast as any, {
    Program(programPath: NodePath<js.Program>) {
      const bodyPaths = programPath.get('body');

      let cellIndex = 0;
      let cellState = 'no cell';

      let cellData: {
        comment?: string;
        content?: string;
      } = {};
      let firstCellStatement: NodePath<js.Statement> | null = null;
      let resultStatement: NodePath<js.Statement> | null = null;

      programPath.node.innerComments?.forEach(commentNode => {
        processComment(null, commentNode);
      });
      bodyPaths.forEach(statementPath => {
        processStatement(statementPath);
      });

      if (cellState !== 'no cell') {
        finishCell();
      }

      function processStatement(statementPath: NodePath<js.Statement>) {
        statementPath.node.leadingComments?.forEach(commentNode => {
          processComment(statementPath, commentNode);
        });
        if (cellState === 'comment') {
          cellState = 'content';
        }
        if (cellState === 'content') {
          const statementCode = printStatement(statementPath.node);
          addContent(statementCode);
          resultStatement = statementPath;
        }
      }

      function processComment(
        statementPath: NodePath<js.Statement> | null,
        commentNode: js.Comment,
      ) {
        if (isCellComment(commentNode)) {
          if (cellState === 'content') {
            finishCell();
            cellState = 'no cell';
          }
          if (cellState === 'no cell') {
            cellState = 'comment';
            firstCellStatement = statementPath;
          }
          cellData.comment =
            (cellData.comment ?? '') + getCellCommentText(commentNode);
        } else {
          if (cellState === 'comment') {
            cellState = 'content';
          }
          addContent(getCellContentCommentCode(commentNode));
        }
      }

      function printStatement(statement: js.Statement) {
        const shouldPrintComments = false;
        return addNewLine(
          generate(statement, {
            comments: shouldPrintComments,
          }).code,
        );
      }

      function addContent(code: string) {
        cellData.content = (cellData.content ?? '') + code;
      }

      function finishCell() {
        if (resultStatement == null) {
          const displayWithNoResult = displayCall('null');
          if (firstCellStatement == null) {
            programPath.node.body = [displayWithNoResult];
          } else {
            firstCellStatement.insertBefore(displayWithNoResult);
          }
        } else if (resultStatement.type === 'ExpressionStatement') {
          const cellResultVariableName = `${internals.resultVariablePrefix}${cellIndex}`;
          resultStatement.replaceWith(
            js.variableDeclaration('const', [
              js.variableDeclarator(
                js.identifier(cellResultVariableName),
                (resultStatement.node as js.ExpressionStatement).expression,
              ),
            ]) as any,
          );
          // TODO: Maybe remove the last semicolon from the result if it wasn't
          // part of the source
          resultStatement.insertAfter(displayCall(cellResultVariableName));
        } else if (resultStatement.type === 'VariableDeclaration') {
          // TODO: We could support more kinds of declarators here
          const lastDeclarator = last(
            (resultStatement.node as js.VariableDeclaration).declarations,
          ).id;
          resultStatement.insertAfter(
            displayCall(
              lastDeclarator.type === 'Identifier'
                ? (lastDeclarator as js.Identifier).name
                : 'null',
            ),
          );
        } else {
          resultStatement.insertAfter(displayCall(''));
        }
        cellData = {};
        firstCellStatement = null;
        resultStatement = null;
        cellState = 'no cell';
        cellIndex++;
      }

      function displayCall(result: string) {
        return js.expressionStatement(
          js.callExpression(js.identifier(internals.displayFunction), [
            js.stringLiteral((cellData.comment ?? '').trim()),
            js.stringLiteral((cellData.content ?? '').trim()),
            js.identifier(result),
          ]),
        ) as any;
      }
    },
  });
  return addNewLine(internals.preambule + generate(ast as any).code);
}

function isCellComment(commentNode: js.Comment) {
  return commentNode.value.startsWith('/');
}

function getCellCommentText(commentNode: js.Comment) {
  // strips leading `/ `
  return commentNode.value.slice(2).trim() + '\n';
}

function getCellContentCommentCode(commentNode: js.Comment) {
  // TODO: support comment block
  return '// ' + commentNode.value.trim() + '\n';
}

function addNewLine(code: string) {
  return code[code.length - 1] === '\n' ? code : code + '\n';
}

function last<T>(array: Array<T>): T {
  return array[array.length - 1];
}

const cellTag = '__notebook__cell__start__';
const cellContentTag = '__notebook__cell__content__';
const cellResultTag = '__notebook__cell__result__';
const cellEndTag = '__notebook__cell__end__';
export const internals = {
  cellTag,
  cellContentTag,
  cellResultTag,
  cellEndTag,
  preambule:
    `const __notebook__ = {show: function(comment, content, result) {` +
    `console.log("${cellTag}");` +
    `console.log(comment);` +
    `console.log("${cellContentTag}");` +
    `console.log(content);` +
    `console.log("${cellResultTag}");` +
    `console.log(result);` +
    `console.log("${cellEndTag}");` +
    `}};\n`,
  displayFunction: '__notebook__.show',
  resultVariablePrefix: '__notebook__result_',
};
