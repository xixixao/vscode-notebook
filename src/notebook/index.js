import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as js from 'babel-types';
export function compile(source) {
    const ast = babelParser.parse(source);
    traverse(ast, {
        Program(programPath) {
            var _a;
            const bodyPaths = programPath.get('body');
            let cellIndex = 0;
            let cellState = 'no cell';
            let cellData = {};
            let firstCellStatement = null;
            let resultStatement = null;
            (_a = programPath.node.innerComments) === null || _a === void 0 ? void 0 : _a.forEach(commentNode => {
                processComment(null, commentNode);
            });
            bodyPaths.forEach(statementPath => {
                processStatement(statementPath);
            });
            if (cellState !== 'no cell') {
                finishCell();
            }
            function processStatement(statementPath) {
                var _a;
                (_a = statementPath.node.leadingComments) === null || _a === void 0 ? void 0 : _a.forEach(commentNode => {
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
            function processComment(statementPath, commentNode) {
                var _a;
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
                        (_a = cellData.comment, (_a !== null && _a !== void 0 ? _a : '')) + getCellCommentText(commentNode);
                }
                else {
                    if (cellState === 'comment') {
                        cellState = 'content';
                    }
                    addContent(getCellContentCommentCode(commentNode));
                }
            }
            function printStatement(statement) {
                const shouldPrintComments = false;
                return addNewLine(generate(statement, {
                    comments: shouldPrintComments,
                }).code);
            }
            function addContent(code) {
                var _a;
                cellData.content = (_a = cellData.content, (_a !== null && _a !== void 0 ? _a : '')) + code;
            }
            function finishCell() {
                if (resultStatement == null) {
                    const displayWithNoResult = displayCall('null');
                    if (firstCellStatement == null) {
                        programPath.node.body = [displayWithNoResult];
                    }
                    else {
                        firstCellStatement.insertBefore(displayWithNoResult);
                    }
                }
                else if (resultStatement.type === 'ExpressionStatement') {
                    const cellResultVariableName = `${internals.resultVariablePrefix}${cellIndex}`;
                    resultStatement.replaceWith(js.variableDeclaration('const', [
                        js.variableDeclarator(js.identifier(cellResultVariableName), resultStatement.node.expression),
                    ]));
                    // TODO: Maybe remove the last semicolon from the result if it wasn't
                    // part of the source
                    resultStatement.insertAfter(displayCall(cellResultVariableName));
                }
                else if (resultStatement.type === 'VariableDeclaration') {
                    // TODO: We could support more kinds of declarators here
                    const lastDeclarator = last(resultStatement.node.declarations).id;
                    resultStatement.insertAfter(displayCall(lastDeclarator.type === 'Identifier'
                        ? lastDeclarator.name
                        : 'null'));
                }
                else {
                    resultStatement.insertAfter(displayCall(''));
                }
                cellData = {};
                firstCellStatement = null;
                resultStatement = null;
                cellState = 'no cell';
                cellIndex++;
            }
            function displayCall(result) {
                var _a, _b;
                return js.expressionStatement(js.callExpression(js.identifier(internals.displayFunction), [
                    js.stringLiteral((_a = cellData.comment, (_a !== null && _a !== void 0 ? _a : '')).trim()),
                    js.stringLiteral((_b = cellData.content, (_b !== null && _b !== void 0 ? _b : '')).trim()),
                    js.identifier(result),
                ]));
            }
        },
    });
    return addNewLine(internals.preambule + generate(ast).code);
}
function isCellComment(commentNode) {
    return commentNode.value.startsWith('/');
}
function getCellCommentText(commentNode) {
    // strips leading `/ `
    return commentNode.value.slice(2).trim() + '\n';
}
function getCellContentCommentCode(commentNode) {
    // TODO: support comment block
    return '// ' + commentNode.value.trim() + '\n';
}
function addNewLine(code) {
    return code[code.length - 1] === '\n' ? code : code + '\n';
}
function last(array) {
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
    preambule: `const __notebook__ = {show: function(comment, content, result) {` +
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
//# sourceMappingURL=index.js.map