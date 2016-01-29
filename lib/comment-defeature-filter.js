'use strict';

const path = require('path');
const Filter = require('broccoli-filter');

class CommentDefeatureFilter extends Filter {
  constructor(tree, options) {
    super(tree, options);
    this._extensions = options.extensions;
    this._features = options.features;
  }

  canProcessFile(relativePath) {
    debug('#canProcessFile - test `%s`', relativePath);
    if (relativePath.indexOf('vendor') === 0 ||
        relativePath.indexOf('bower_components') === 0) {
      return false;
    }
    const extension = path.extname(relativePath).substr(1);
    if (this._extensions.indexOf(extension) === -1) {
      return false;
    }
    return true;
  }

  processString(content, relativePath) {
    debug('#processString - Processing `%s`', relativePath);
    const features = this._features;
    return processString(content, features, relativePath);
  }
}

module.exports = CommentDefeatureFilter;

///
/// Internal API
///

const PATTERNS = {
  JAVASCRIPT: {
    LINE: /^\/\/\/ feature:(.*)$/,
    REGION: {
      ENTRY: /^\/\/\/ <feature:(.*)>$/,
      EXIT: /^\/\/\/ <\/feature:(.*)>$/
    },
    REJECT: {
      START: '/// ',
      END: '',
      REPLACE: {
        MATCH: /(\/\*|\*\/)/g,
        WITH: '--'
      }
    }
  },

  CSS: {
    LINE: /^\/\* feature:(.*) \*\/$/,
    REGION: {
      ENTRY: /^\/\* <feature:(.*)> \*\/$/,
      EXIT: /^\/\* <\/feature:(.*)> \*\/$/
    },
    REJECT: {
      START: '/* ',
      END: ' */',
      REPLACE: {
        MATCH: /(\/\*|\*\/)/g,
        WITH: '--'
      }
    }
  },

  HANDLEBARS: {
    LINE: /^\{\{!-- feature:(.*) --\}\}$/,
    REGION: {
      ENTRY: /^\{\{!-- <feature:(.*)> --\}\}$/,
      EXIT: /^\{\{!-- <\/feature:(.*)> --\}\}$/
    },
    REJECT: {
      START: '{{!-- ',
      END:   ' --}}',
      REPLACE: {
        MATCH: /(\{\{!--|--\}\})/g,
        WITH:  '--'
      }
    }
  }
};

const FILETYPES = {
  '.css':  'CSS',
  '.scss': 'CSS',
  '.hbs':  'HANDLEBARS',
  '.js':   'JAVASCRIPT'
};

function processString(content, features, relativePath) {
  validateFeatures(features);
  const extension = path.extname(relativePath);
  const lines = content.split('\n');
  const pattern = PATTERNS[FILETYPES[extension]];

  let isNextLineDiscardable;
  const regionStack = [];

  // FIXME tame the beast
  const draft = lines.map((line, n) => {
    const lineNumber = n + 1;
    let keep = true;
    let chunks;

    if (chunks = extractDescriptor(line, pattern.LINE)) {
      const name = chunks[1];
      debug('#processString - %s:%s - encountered feature `%s`', relativePath, lineNumber, name);
      if (isNextLineDiscardable) {
        throw new Error(`Overloading not allowed (${relativePath}:${lineNumber})`, relativePath, lineNumber);
      }
      if (!features[name]) {
        isNextLineDiscardable = true;
        line = line.trim();
      }
    } else if (chunks = extractDescriptor(line, pattern.REGION.ENTRY)) {
      const name = chunks[1];
      debug('#processString - %s:%s - encountered feature region start `%s`', relativePath, lineNumber, name);
      if (!features[name]) {
        if (regionStack.length) {
          keep = false;
        } else {
          line = line.trim();
        }
        regionStack.push(name);
      }
    } else if (chunks = extractDescriptor(line, pattern.REGION.EXIT)) {
      const name = chunks[1];
      debug('#processString - %s:%s - encountered feature region end `%s`', relativePath, lineNumber, name);
      if (!features[name]) {
        const lastRegionName = regionStack.pop();
        if (name !== lastRegionName) {
          throw new Error(`Expected to exit \`${lastRegionName}\`, saw \`${name}\` instead (${relativePath}:${lineNumber})`);
        }
        if (regionStack.length) {
          keep = false;
        } else {
          line = line.trim();
        }
      }
    } else if (isNextLineDiscardable || regionStack.length) {
      debug('#processString - %s:%s - discard', relativePath, lineNumber);
      keep = false;
      isNextLineDiscardable = false;
    } else {
      debug('#processString - %s:%s - keep', relativePath, lineNumber);
    }
    return keep ? line : rejectLine(line, pattern.REJECT);
  });
  return draft.join('\n');
}

function debug() {
  if (global.DEBUG === true) {
    console.log.apply(console, arguments);
  }
}

function extractDescriptor(line, pattern) {
  return line.trim().match(pattern);
}

function rejectLine(line, reject) {
  return reject.START +
    line.replace(reject.REPLACE.MATCH, reject.REPLACE.WITH) +
    reject.END;
}

function validateFeatures(features) {
  if (!features) {
    throw new Error('Missing feature hash');
  }
}
