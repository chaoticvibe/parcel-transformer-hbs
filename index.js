const minify = require("html-minifier").minify;

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Transformer } = require('@parcel/plugin');
const Handlebars = require('handlebars');
const handlebarsWax = require('handlebars-wax');
const handlebarsLayouts = require('handlebars-layouts');
const handlebarsHelpers = require('handlebars-helpers');
const glob = require('glob');
const fastGlob = require('fast-glob');
const { minify } = require('html-minifier');

const addDep = require('./addDep');
const { getMayaSettings, findProjectRoot, htmlObfuscateClasses } = require('./utils');
const isProduction =  process.env.NODE_ENV === "production";
// Configuração padrão de diretórios Handlebars
const defaultConfig = {
  data: 'src/markup/data',
  decorators: 'src/markup/decorators',
  helpers: 'src/markup/helpers',
  layouts: 'src/markup/layouts',
  partials: 'src/markup/partials',
  lang: 'src/lang' // Pasta onde os arquivos de idiomas estarão
};

function toArray(value) {
  if (typeof value === 'undefined') {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

async function loadLanguages(langDir, cwd) {
  // Obtemos os arquivos de idioma no diretório
  const langFiles = await fastGlob(`${langDir}/*.json`, {cwd});

  // Mapeamos para criar promessas de leitura dos arquivos
  const languagePromises = langFiles.map(async (file) => {
    const langKey = path.basename(file, '.json');
    const filePath = path.join(langDir, file);
    const fileContent = await fsp.readFile(filePath, 'utf8');
    return { langKey, content: JSON.parse(fileContent) };
  });

  // Esperamos todas as promessas se resolverem
  const languageData = await Promise.all(languagePromises);

  // Transformamos os resultados em um objeto
  const languages = {};
  languageData.forEach(({ langKey, content }) => {
    languages[langKey] = content;
  });

  return { langFiles, languages };
}
module.exports = new Transformer({
  async loadConfig({ config }) {
    const configFile = await config.getConfig([
      'handlebars.config.js',
      'handlebars.config.json',
      'hbs.config.js',
      'hbs.config.json'
    ], {});

    if (configFile) {
      const isJS = path.extname(configFile.filePath) === '.js';
      if (isJS) {
        config.invalidateOnStartup();
      }

      return {
        ...defaultConfig,
        ...configFile.contents
      };
    }

    return defaultConfig;
  },

  async transform({ asset, config, options }) {
    const extname = path.extname(asset.filePath).toLowerCase();
    let content = await asset.getCode();
    const projectRoot = findProjectRoot(null, options);
    // Verificação para arquivos com sufixo .hbs.html ou .hbs.htm
    if (asset.filePath.endsWith('.hbs.html') || asset.filePath.endsWith('.hbs.htm')) {
      let defaultMayaIgnoreList;
      try {
        const modulePath = require.resolve('parcel-transformer-maya/defaultIgnoreList.js', {
          paths: [asset.filePath, __dirname],
        });
        defaultMayaIgnoreList = require(modulePath);
      } catch (err) {
        console.warn("--parcel-transformer-hbs: Failed to require defaultMayaIgnoreList from parcel-transformer-maya");
      }

    
      const mayaConfigs = getMayaSettings(projectRoot);
      const mayaConfig = mayaConfigs && Array.isArray(mayaConfigs) && mayaConfigs[0] ? mayaConfigs[0] : {};
      const mayaIgnoreList = mayaConfig.ignoreList && Array.isArray(mayaConfig.ignoreList) ? mayaConfig.ignoreList : [];

      if (defaultMayaIgnoreList && mayaConfig.useBootstrapIgnoreList) {
        mayaIgnoreList.push(...defaultMayaIgnoreList.bootstrapIgnoreList);
      }
      const mayaHashSalt = mayaConfig.hashSalt ? mayaConfig.hashSalt.toString() : "";
      const { html, sources } = addDep(content, asset);
      content = isProduction ? htmlObfuscateClasses(html, mayaIgnoreList, mayaHashSalt) : html;

      try {
        content = isProduction
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
          knownHelpers: handlebarsHelpers,
        });
        asset.setCode(`
        let sources = [];
        ${sources}
        let regex = new RegExp('https?://[^/]+/?');
        let tpl = ${precompiled};
        for(let i = 0; i < sources.length; i++){
          let dep = sources[i];
          let url = dep[1].replace(regex, '');
          sources[i][1] = url;
        }
        export {tpl, sources};`);
        asset.type = 'js';
      } catch (err) {
        throw new Error("--parcel-transformer-hbs: Error compiling template.", err);
      }

      return [asset];
    }

    // Caso padrão para arquivos .htm e .html
    const { langFiles, languages } = await loadLanguages(config.lang, projectRoot);

    const wax = handlebarsWax(Handlebars);
    wax.helpers(handlebarsHelpers);
    wax.helpers(handlebarsLayouts);

    toArray(config.helpers).forEach(x => wax.helpers(`${x}/**/*.js`));
    toArray(config.data).forEach(x => wax.data(`${x}/**/*.{json,js}`));
    toArray(config.decorators).forEach(x => wax.decorators(`${x}/**/*.js`));
    toArray(config.layouts).forEach(x => wax.partials(`${x}/**/*.{htm,html}`));
    toArray(config.partials).forEach(x => wax.partials(`${x}/**/*.{htm,html}`));

    const dependencies = [
      toArray(config.helpers).map(x => `${x}/**/*.js`),
      toArray(config.data).map(x => `${x}/**/*.{json,js}`),
      toArray(config.decorators).map(x => `${x}/**/*.js`),
      toArray(config.layouts).map(x => `${x}/**/*.{htm,html}`),
      toArray(config.partials).map(x => `${x}/**/*.{htm,html}`)
    ].flat().map(g => glob.sync(g)).flat();

    for (const langFile of langFiles) {
      asset.invalidateOnFileChange(langFile);
    }

    for (const dep of dependencies) {
      asset.addDependency({
        specifier: dep,
        specifierType: 'file',
        resolveFrom: asset.filePath,
      });
    }


     // Gerar arquivos HTML por idioma
     const childAssets = [];
     for (const [lang, langData] of Object.entries(languages)) {
       const data = Object.assign({}, langData, { NODE_ENV: process.env.NODE_ENV });
       const result = wax.compile(content)(data);
 
       const langAsset = await asset.addDependency({
        specifier: path.join(path.dirname(asset.filePath), `index.${lang}.html`),
        specifierType: 'file',
        resolveFrom: asset.filePath,
      });
      console.log(langAsset);
      langAsset.setCode(result);
      langAsset.type = 'html';
      childAssets.push(langAsset);
     }
    
     console.log("childAssets");
     console.log(childAssets);
    return [childAssets];
  }
});
