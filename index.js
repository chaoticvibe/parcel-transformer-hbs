const minify = require("html-minifier").minify;
const fs = require("fs");
const path = require("path");
const { Transformer } = require("@parcel/plugin");
const { replaceURLReferences } = require("@parcel/utils");

let Handlebars = require("handlebars");
let helpers = require("handlebars-helpers")();
let handlebarsWax = require("handlebars-wax");

const wax = handlebarsWax(Handlebars).helpers(helpers);

const transformer = new Transformer({
  async transform({ asset, bundleGraph, getInlineBundleContents }) {
    // Obter o código do asset
    let content = await asset.getCode();

    // Atualizar URLs de recursos (similar ao posthtml)
    let { contents: updatedContent, map } = replaceURLReferences({
      bundle: asset.bundle,
      bundleGraph,
      contents: content,
      relative: false,
      getReplacement: contents => contents.replace(/"/g, '&quot;'),
    });

    // Minificar o HTML se estiver em produção
    let minifiedContent = process.env.NODE_ENV === 'production' ? minify(updatedContent, {
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
    }) : updatedContent;

    // Precompilar o template Handlebars
    const precompiled = Handlebars.precompile(minifiedContent, {
      knownHelpers: helpers,
    });

    // Definir o código do asset para a função precompilada
    asset.setCode(`
      let tpl = ${precompiled};
      import { template } from 'handlebars/runtime';
      export default template(${precompiled});
    `);
    asset.type = "js";

    return [asset];
  },
});

module.exports = transformer;