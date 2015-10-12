'use strict';

const CommentDefeatureFilter = require('./lib/comment-defeature-filter');

module.exports = {
  name: 'ember-cli-comment-defeature',

  included(app) {
    this._super.included.apply(this, arguments);
    this.options = generateOptions(app.options.commentDefeature || {});
  },

  preprocessTree(type, tree) {
    switch (type) {
    case 'js':
    case 'css':
    case 'template':
      return new CommentDefeatureFilter(tree, this.options);
    }
    return tree;
  }
};

function generateOptions(options) {
  if (options.extensions && !Array.isArray(options.extensions)) {
    throw new Error ('`commentDefeature.extensions` must be an array of file extensions');
  }
  return Object.assign({
      features: {},
      extensions: ['js', 'hbs', 'css', 'scss']
    }, options);
}
