import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// suite('Extension Test Suite', () => {
// 	vscode.window.showInformationMessage('Start all tests.');

// 	test('Sample test', () => {
// 		assert.equal(-1, [1, 2, 3].indexOf(5));
// 		assert.equal(-1, [1, 2, 3].indexOf(0));
// 	});
// });

import * as notebookCompiler from '../../notebook/index';
import * as prettier from 'prettier';

const {
  displayFunction,
  preambule,
  resultVariablePrefix,
} = notebookCompiler.internals;

suite('Command Test Suite for JS', () => {
  test('Empty file', () => {
    eq('', '');
  });
  test('Empty single cell', () => {
    eq(
      `
        /// Hello
      `,
      `
      /// Hello

      ${displayFunction}(
        'Hello',
        '',
        null,
      )
      `,
    );
  });
  test('Single cell with empty comment', () => {
    eq(
      `
        ///
        42
      `,
      `
      ///
      const ${resultVariablePrefix}0 = 42;

      ${displayFunction}(
        '',
        '42;',
        ${resultVariablePrefix}0
      )
      `,
    );
  });
  test('Single cell with comment', () => {
    eq(
      `
        /// Summary of something
        42
      `,
      `
      /// Summary of something
      const ${resultVariablePrefix}0 = 42;

      ${displayFunction}(
        'Summary of something',
        '42;',
        ${resultVariablePrefix}0
      )
      `,
    );
  });
  test('Two cells', () => {
    eq(
      `
        /// A
        1
        /// B
        2
      `,
      `
      /// A
      const ${resultVariablePrefix}0 = 1; /// B

      ${displayFunction}(
        'A',
        '1;',
        ${resultVariablePrefix}0
      )

      const ${resultVariablePrefix}1 = 2;

      ${displayFunction}(
        'B',
        "2;",
        ${resultVariablePrefix}1
      )
      `,
    );
  });
});

function eq(a: string, b: string) {
  assert.equal(notebookCompiler.compile(format(a)), preambule + format(b));
}

function format(x: string) {
  return prettier.format(x, {parser: 'babel'});
}
