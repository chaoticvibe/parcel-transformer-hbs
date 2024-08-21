const minify = require("html-minifier").minify;
const { Transformer } = require("@parcel/plugin");
let Handlebars = require("handlebars");
let helpers = require("handlebars-helpers")();
let handlebarsWax = require("handlebars-wax");
const addDep = require("./addDep");
const { getMayaSettings, findProjectRoot, htmlObfuscateClasses } = require("./utils");

const wax = handlebarsWax(Handlebars).helpers(helpers);
const isProduction =  process.env.NODE_ENV === "production";
const transformer = new Transformer({
  async transform({ asset, options }) {
    let content = await asset.getCode();
    let defaultMayaIgnoreList;
    try {
      const modulePath = require.resolve(
        "parcel-reporter-maya/defaultIgnoreList.js",
        {
          paths: [asset.filePath, __dirname],
        }
      );
      defaultMayaIgnoreList = require(modulePath);
    } catch (err) {
      console.warn(
        "--parcel-transformer-hbs: Failed to require defaultMayaIgnoreList from parcel-reporter-maya"
      );
    }

    const projectRoot = findProjectRoot(null, options);
    const mayaConfigs = getMayaSettings(projectRoot);
    const mayaConfig =
      mayaConfigs && Array.isArray(mayaConfigs) && mayaConfigs[0]
        ? mayaConfigs[0]
        : {};
    const mayaIgnoreList =
      mayaConfig.ignoreList && Array.isArray(mayaConfig.ignoreList)
        ? mayaConfig.ignoreList
        : [];

    if (defaultMayaIgnoreList && mayaConfig.useBootstrapIgnoreList) {
      mayaIgnoreList.push(...defaultMayaIgnoreList.bootstrapIgnoreList);
    }
    const hashSalt = mayaConfig.hashSalt ? mayaConfig.hashSalt.toString() : "";
    content = addDep(content, asset);

    content = isProduction ? htmlObfuscateClasses(content, mayaIgnoreList, hashSalt) : content;
    
    try {
      content =
      isProduction
          ? minify(content, {
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
            })
          : content;

      const precompiled = Handlebars.precompile(content, {
        knownHelpers: helpers,
      });
      asset.setCode(`
      let tpl = ${precompiled};
      import { template } from 'handlebars/runtime';
      export default template(${precompiled})`);
      asset.type = "js";
    } catch (err) {
      throw new Error(
        "--parcel-transformer-hbs: Error compiling template.",
        err
      );
    }

    return [asset];
  },
});

module.exports = transformer;
