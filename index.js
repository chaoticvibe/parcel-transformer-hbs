"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function _plugin() {
  const data = require("@parcel/plugin");
  _plugin = function () {
    return data;
  };
  return data;
}

function _posthtmlParser() {
  const data = require("posthtml-parser");
  _posthtmlParser = function () {
    return data;
  };
  return data;
}

function _nullthrows() {
  const data = _interopRequireDefault(require("nullthrows"));
  _nullthrows = function () {
    return data;
  };
  return data;
}

function _posthtml() {
  const data = _interopRequireDefault(require("posthtml"));
  _posthtml = function () {
    return data;
  };
  return data;
}

function _posthtmlRender() {
  const data = require("posthtml-render");
  _posthtmlRender = function () {
    return data;
  };
  return data;
}

function _semver() {
  const data = _interopRequireDefault(require("semver"));
  _semver = function () {
    return data;
  };
  return data;
}

var _dependencies = _interopRequireDefault(require("./dependencies"));
var _inline = _interopRequireDefault(require("./inline"));
function _diagnostic() {
  const data = _interopRequireDefault(require("@parcel/diagnostic"));
  _diagnostic = function () {
    return data;
  };
  return data;
}

function _handlebars() {
  const data = require("handlebars");
  _handlebars = function () {
    return data;
  };
  return data;
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = exports.default = new (_plugin().Transformer)({
  canReuseAST({ ast }) {
    return ast.type === 'posthtml' && _semver().default.satisfies(ast.version, '^0.4.0');
  },

  async parse({ asset }) {
    return {
      type: 'posthtml',
      version: '0.4.1',
      program: (0, _posthtmlParser().parser)(await asset.getCode(), {
        lowerCaseTags: true,
        lowerCaseAttributeNames: true,
        sourceLocations: true,
        xmlMode: asset.type === 'xhtml'
      })
    };
  },

  async transform({ asset, options }) {
    if (asset.type === 'htm') {
      asset.type = 'html';
    }
    asset.bundleBehavior = 'isolated';
    let ast = (0, _nullthrows().default)(await asset.getAST());
    let hasModuleScripts;

    try {
      hasModuleScripts = (0, _dependencies.default)(asset, ast);
    } catch (errors) {
      if (Array.isArray(errors)) {
        throw new (_diagnostic().default)({
          diagnostic: errors.map(error => ({
            message: error.message,
            origin: '@parcel/transformer-html',
            codeFrames: [{
              filePath: error.filePath,
              language: 'html',
              codeHighlights: [error.loc]
            }]
          }))
        });
      }
      throw errors;
    }

    const { assets: inlineAssets, hasModuleScripts: hasInlineModuleScripts } = (0, _inline.default)(asset, ast);
    const result = [asset, ...inlineAssets];

    // Pré-compilar o conteúdo HTML como template Handlebars
    if (options.hmrOptions && !(hasModuleScripts || hasInlineModuleScripts)) {
      const script = {
        tag: 'script',
        attrs: {
          src: asset.addURLDependency('hmr.js', { priority: 'parallel' })
        },
        content: []
      };
      const found = findFirstMatch(ast, [{ tag: 'body' }, { tag: 'html' }]);
      if (found) {
        found.content = found.content || [];
        found.content.push(script);
      } else {
        ast.program.push(script);
      }
      asset.setAST(ast);
      result.push({
        type: 'js',
        content: '',
        uniqueKey: 'hmr.js'
      });
    }

    // Pré-compilar o template Handlebars e substituir o conteúdo do asset
    const content = (0, _posthtmlRender().render)(ast.program);
    const precompiled = _handlebars().default.precompile(content);

    asset.setCode(`
      import { template } from 'handlebars/runtime';
      export default template(${precompiled});
    `);
    asset.type = 'js';
    return result;
  },

  generate({ ast, asset }) {
    return {
      content: (0, _posthtmlRender().render)(ast.program, {
        closingSingleTag: asset.type === 'xhtml' ? 'slash' : undefined
      })
    };
  }
});

function findFirstMatch(ast, expressions) {
  let found;
  for (const expression of expressions) {
    (0, _posthtml().default)().match.call(ast.program, expression, node => {
      found = node;
      return node;
    });
    if (found) {
      return found;
    }
  }
}

module.exports = _default;
