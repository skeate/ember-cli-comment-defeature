/* eslint-env mocha */
'use strict';

// global.DEBUG = true;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const broccoliTestHelpers = require('broccoli-test-helpers');

const CommentDefeatureFilter = require('../lib/comment-defeature-filter');

const EXPECTED_LINE = `\
/// feature:alpha
import alpha from 'alpha';
import bravo from 'bravo';

/// feature:charlie
/// console.log('charlie');
/// feature:delta
/// console.log('delta');
`;
const EXPECTED_REGION = `\
/// <feature:alpha>
/// console.log('alpha');
/// console.log('alpha');
/// console.log('alpha');
/// </feature:alpha>

/// <feature:bravo>
// I can has nesting?
function bravo() {
  console.log('bravo');
/// <feature:charlie>
///   function charlie() {
///     /// <feature:delta>
///     console.log('delta');
///     /// </feature:delta>
///   }
/// </feature:charlie>
}
/// </feature:bravo>
`;
const EXPECTED_WHOLE_FILE = `\
/// <feature:wholefile>
/// console.log('alpha');
/// console.log('bravo');
/// console.log('charlie');
/// `;
const EXPECTED_MIXED = `\
/// <feature:alpha>
console.log('alpha');
console.log('alpha');
/// feature:bravo
/// console.log('bravo');
/// feature:charlie
/// console.log('charlie');
// Ignore this normal comment
console.log('alpha');
/// </feature:alpha>
`;
const EXPECTED_CSS = `\
.alpha {
  /* feature:alpha */
  color: red;
}
.bravo {
/* <feature:bravo> */
/*   background-color: orange; */
/*   -- some harmless comment -- */
/*   border-color: orange; */
/*   color: orange; */
/* </feature:bravo> */
  padding: 5px;
}
`;
const EXPECTED_SCSS = `\
.alpha {
  /* feature:alpha */
  $favorite-color: green;
}
.bravo {
/* <feature:bravo> */
/*   $favorite-number: 8675309; */
/*   -- some harmless comment -- */
/*   background-color: orange; */
/*   border-color: orange; */
/*   color: orange; */
/* </feature:bravo> */
}
`;
const EXPECTED_HANDLEBARS = `\
{{!-- feature:alpha --}}
alpha
{{!-- <feature:bravo> --}}
{{!-- {{bravo}} --}}
{{!-- {{! inline comment, shouldn't affect anything }} --}}
{{!-- {{bravo}} --}}
{{!-- -- block comment, could mess things up -- --}}
{{!-- {{bravo}} --}}
{{!-- </feature:bravo> --}}
`;
const EXPECTED_VENDOR_CSS = `\
/* feature:nevergonnagiveyouup */
.massive-framework {}
`;
const EXPECTED_VENDOR_JS = `\
/// feature:nevergonnagiveyouup
function massiveFramework() { }
`;
const EXPECTED_ERROR_NO_FEATURES = 'Missing feature hash';
const EXPECTED_ERROR_BAD_SEQUENCE = 'Expected to exit `lolwut`, saw `outofsequence` instead (malformed-outofsequence.js:8)';
const EXPECTED_ERROR_OVERLOAD = 'Overloading not allowed (malformed-overloaded.js:2)';

describe('CommentDefeatureFilter', () => {
  let build;

  beforeEach(() => {
    build = broccoliTestHelpers.makeTestHelper({
      fixturePath: __dirname,
      subject(tree, features) {
        return new CommentDefeatureFilter(tree, {
          features,
          extensions: ['js', 'hbs', 'css', 'scss']
        });
      }
    });
  });

  afterEach(() => {
    broccoliTestHelpers.cleanupBuilders();
  });

  it('handles single lines', () => {
    return build('fixtures/single-line', {alpha: true})
      .then(results => assert.equal(readSingle(results), EXPECTED_LINE));
  });

  it('handles regions', () => {
    return build('fixtures/region', {bravo: true})
      .then(results => assert.equal(readSingle(results), EXPECTED_REGION));
  });

  it('handles mixed usage in the same file', () => {
    return build('fixtures/mixed', {alpha: true})
      .then(results => assert.equal(readSingle(results), EXPECTED_MIXED));
  });

  it('handles handlebars files', () => {
    return build('fixtures/handlebars', {alpha: true})
      .then(results => assert.equal(readSingle(results), EXPECTED_HANDLEBARS));
  });

  it('handles css files', () => {
    return build('fixtures/css', {alpha: true})
      .then(results => assert.equal(readSingle(results), EXPECTED_CSS));
  });

  it('handles scss files', () => {
    return build('fixtures/scss', {alpha: true})
      .then(results => assert.equal(readSingle(results), EXPECTED_SCSS));
  });

  it('handles unclosed regions (to target whole file)', () => {
    return build('fixtures/whole-file', {})
      .then(results => assert.deepEqual(readSingle(results), EXPECTED_WHOLE_FILE));
  });

  it('ignores vendor files', () => {
    return build('fixtures/ignores-vendor', {alpha: true})
      .then(results => assert.deepEqual(readMultiple(results), [
        EXPECTED_VENDOR_CSS, EXPECTED_VENDOR_JS,  // ./bower_components/*.{js,css}
        EXPECTED_VENDOR_CSS, EXPECTED_VENDOR_JS,  // ./bower_components/massiveframework/*.{js,css}
        EXPECTED_LINE,                            // ./source.js
        EXPECTED_VENDOR_CSS, EXPECTED_VENDOR_JS,  // ./vendor/massiveframework/*.{js,css}
        EXPECTED_VENDOR_CSS, EXPECTED_VENDOR_JS   // ./vendor/*.{js,css}
      ]));
  });

  it('handles multiple files', () => {
    return build('fixtures/multiple-files', {alpha: true})
      .then(results => assert.deepEqual(readMultiple(results), [EXPECTED_LINE, EXPECTED_CSS, EXPECTED_SCSS, EXPECTED_HANDLEBARS]));
  });

  it('throws when feature list omitted', () => {
    let expectedError;
    return build('fixtures/empty', undefined)
      .catch(error => expectedError = error.message)
      .finally(() => assert.equal(expectedError, EXPECTED_ERROR_NO_FEATURES));
  });

  it('throws when regions are out of sequence', () => {
    let expectedError;
    return build('fixtures/malformed-outofsequence', {})
      .catch(error => expectedError = error.message)
      .finally(() => assert.equal(expectedError, EXPECTED_ERROR_BAD_SEQUENCE));
  });

  it('throws when regions are overloaded', () => {
    let expectedError;
    return build('fixtures/malformed-overloaded', {})
      .catch(error => expectedError = error.message)
      .finally(() => assert.equal(expectedError, EXPECTED_ERROR_OVERLOAD));
  });
});

function readSingle(results) {
  const files = filterOnlyFiles(results);
  assert.equal(files.length, 1, 'Should be exactly one file');
  return readMultiple(results).pop();
}

function readMultiple(results) {
  const files = filterOnlyFiles(results).sort();  // Deterministic please
  assert(files.length, 'Should be at least one file');
  return files.map(filename => {
    const filepath = path.join(results.directory, filename);
    return fs.readFileSync(filepath).toString('utf-8');
  });
}

function filterOnlyFiles(results) {
  return results.files.filter(str => !/\/$/.test(str));
}
