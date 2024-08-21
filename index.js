const minify = require("html-minifier").minify;
const { Transformer } = require("@parcel/plugin");
let Handlebars = require("handlebars");
let helpers = require("handlebars-helpers")();
let handlebarsWax = require("handlebars-wax");
const addDep = require("./addDep");

const wax = handlebarsWax(Handlebars).helpers(helpers);

const transformer = new Transformer({
  async transform({ asset }) {
    let content = await asset.getCode();
    asset.setEnvironment({
      sourceType: "html"
    });
    
    content = addDep(content, asset);
    
    content = process.env.NODE_ENV === 'production' ? minify(content, {
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
    }) : content;
    const precompiled = Handlebars.precompile(content, {
      knownHelpers: helpers,
    });
    asset.setCode(`
        let tpl = ${precompiled};
        import { template } from 'handlebars/runtime';
        export default template(${precompiled})`);
    asset.type = "js";
    return [asset];
  },
});

module.exports = transformer;
