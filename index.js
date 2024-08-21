const { Transformer } = require('@parcel/plugin');
const { parse } = require('posthtml-parser');
const nullthrows = require('nullthrows');
const { render } = require('posthtml-render');
const semver = require('semver');
const collectDependencies = require('./dependencies'); // Implemente ou substitua
const extractInlineAssets = require('./inline'); // Implemente ou substitua
const ThrowableDiagnostic = require('@parcel/diagnostic');
const Handlebars = require('handlebars');
const helpers = require('handlebars-helpers')();
const handlebarsWax = require('handlebars-wax');
const minify = require('html-minifier').minify;

const wax = handlebarsWax(Handlebars).helpers(helpers);

module.exports = new Transformer({
  canReuseAST({ ast }) {
    return ast.type === 'posthtml' && semver.satisfies(ast.version, '^0.4.0');
  },

  async parse({ asset }) {
    return {
      type: 'posthtml',
      version: '0.4.1',
      program: parse(await asset.getCode(), {
        lowerCaseTags: true,
        lowerCaseAttributeNames: true,
        sourceLocations: true,
        xmlMode: asset.type === 'xhtml',
      }),
    };
  },

  async transform({ asset, options }) {
    if (asset.type === 'htm') {
      asset.type = 'html';
    }

    asset.bundleBehavior = 'isolated';
    let ast = nullthrows(await asset.getAST());

    try {
      collectDependencies(asset, ast);
    } catch (errors) {
      if (Array.isArray(errors)) {
        throw new ThrowableDiagnostic({
          diagnostic: errors.map(error => ({
            message: error.message,
            origin: '@parcel/transformer-handlebars',
            codeFrames: [
              {
                filePath: error.filePath,
                language: 'html',
                codeHighlights: [error.loc],
              },
            ],
          })),
        });
      }
      throw errors;
    }

    const { assets: inlineAssets } = extractInlineAssets(asset, ast);
    const result = [asset, ...inlineAssets];

    if (options.hmrOptions) {
      const script = {
        tag: 'script',
        attrs: {
          src: asset.addURLDependency('hmr.js', {
            priority: 'parallel',
          }),
        },
        content: [],
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
        uniqueKey: 'hmr.js',
      });
    }

    return result;
  },

  generate({ ast, asset }) {
    let code = render(ast.program, {
      closingSingleTag: asset.type === 'xhtml' ? 'slash' : undefined,
    });

    code = process.env.NODE_ENV === 'production' ? minify(code, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
      removeEmptyAttributes: false,
      removeOptionalTags: true,
      minifyJS: true,
      minifyCSS: true,
      caseSensitive: true,
      keepClosingSlash: true,
      html5: true,
    }) : code;

    const precompiled = Handlebars.precompile(code, {
      knownHelpers: helpers,
    });

    return {
      content: `
        const tpl = ${precompiled};
        const { template } = require('handlebars/runtime');
        module.exports = template(${precompiled});
      `,
    };
  },
});

function findFirstMatch(ast, expressions) {
  let found;

  for (const expression of expressions) {
    require('posthtml')().match.call(ast.program, expression, node => {
      found = node;
      return node;
    });

    if (found) {
      return found;
    }
  }
}
