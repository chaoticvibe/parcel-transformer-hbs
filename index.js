const minify = require("html-minifier").minify;

const path = require("path");
const fs = require("fs-extra");
const fsp = fs.promises;
const { Transformer } = require("@parcel/plugin");
const Handlebars = require("handlebars");
const handlebarsWax = require("handlebars-wax");
const handlebarsLayouts = require("handlebars-layouts");
const handlebarsHelpers = require("handlebars-helpers");
const fastGlob = require("fast-glob");
const addDep = require("./addDep");
const {
  getMayaSettings,
  findProjectRoot,
  htmlObfuscateClasses,
} = require("./utils");
const isProduction = process.env.NODE_ENV === "production";
// Configuração padrão de diretórios Handlebars
const defaultConfig = {
  data: "src/markup/data",
  decorators: "src/markup/decorators",
  helpers: "src/markup/helpers",
  layouts: "src/markup/layouts",
  partials: "src/markup/partials",
  lang: "src/lang", // Pasta onde os arquivos de idiomas estarão
};

function toArray(value) {
  if (typeof value === "undefined") {
    return [];
  }
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
function getFilteredFiles(files) {
  return files.filter((file) => !/\.(hbs|handlebars)\.(html|htm)$/.test(file));
}
// Function to extract partials from a Handlebars template
function extractPartials(templateContent) {
  const partials = [];

  // Define a regex pattern to find all partials in the template
  const partialPattern = /{{>\s*([\w-]+)\s*}}/g;
  let match;

  while ((match = partialPattern.exec(templateContent)) !== null) {
    partials.push(match[1]);
  }

  return partials;
}

function extractLayouts(templateContent) {
  const layoutRegex = /{{#layout\s+"([^"]+)"}}.*?{{\/layout}}/gs;

  // Encontrar todos os matches
  const matches = [];
  let match;
  while ((match = layoutRegex.exec(templateContent)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

// Function to map partial names to file paths
function mapPartialsToFilePaths(partials, baseDir) {
  return partials.reduce((map, partial) => {
    const partialPath = path.join(baseDir, `${partial}.html`);
    map[partial] = partialPath;
    return map;
  }, {});
}

function partialsToFilePaths(partials, baseDir) {
  let partialsMap = mapPartialsToFilePaths(partials, baseDir);
  if (!Object.keys(partialsMap).length) {
    return [];
  }
  return Object.values(partialsMap);
}
function layoutsToFilePaths(partials, baseDir) {
  return partialsToFilePaths(partials, baseDir);
}

// Main function to process a Handlebars template file

async function loadLanguages(langDir, cwd) {
  // Obtemos os arquivos de idioma no diretório
  const langFiles = await fastGlob(`${langDir}/*.json`);
  // Mapeamos para criar promessas de leitura dos arquivos
  const languagePromises = langFiles.map(async (file) => {
    const langKey = path.basename(file, ".json");
    const fileContent = await fsp.readFile(file, "utf8");
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
    const configFile = await config.getConfig(
      [
        "handlebars.config.js",
        "handlebars.config.json",
        "hbs.config.js",
        "hbs.config.json",
      ],
      {}
    );

    if (configFile) {
      const isJS = path.extname(configFile.filePath) === ".js";
      if (isJS) {
        config.invalidateOnStartup();
      }

      return {
        ...defaultConfig,
        ...configFile.contents,
      };
    }

    return defaultConfig;
  },

  async transform({ asset, config, options }) {
    let content = await asset.getCode();
    const projectRoot = findProjectRoot(null, options);
    try {
      const wax = handlebarsWax(Handlebars, { cwd: projectRoot });
      wax.helpers(handlebarsHelpers);
      wax.helpers(handlebarsLayouts);

      const partialsDir = path.join(
        projectRoot,
        String(config.partials ? config.partials : "src/views/partials/")
      );
      const layoutsDir = path.join(
        projectRoot,
        String(config.layouts ? config.layouts : "src/views/layouts/")
      );

      ["data", "decorators", "helpers", "layouts", "partials"].forEach(
        (value) => {
          let sources = toArray(config[value]);
          config[value] = sources;
        }
      );

      config.helpers.forEach((x) => wax.helpers(`${x}/**/*.js`));
      config.data.forEach((x) => wax.data(`${x}/**/*.{json,js}`));
      config.decorators.forEach((x) => wax.decorators(`${x}/**/*.js`));

      const partials = partialsToFilePaths(
        extractPartials(content),
        partialsDir
      );
      const layouts = layoutsToFilePaths(extractLayouts(content), layoutsDir);
      console.log("layouts:", layouts);
      console.log("partials:", partials);
      const layoutsGlob = config.layouts.map((x) => `${x}/**/*.{htm,html,hbs}`);
      const partialsGlob = config.partials.map(
        (x) => `${x}/**/*.{html,html,hbs}`
      );
      const [partialsFiles, layoutsFiles] = await Promise.all[fastGlob(...partialsGlob), fastGlob(...layoutsGlob)];
      console.log("layoutsFiles: ", layoutsFiles);
      console.log("partialsFiles: ", partialsFiles);
      console.log("tripppp");
      const depPatterns = [
        config.helpers.map((x) => `${x}/**/*.js`),
        config.data.map((x) => `${x}/**/*.{json,js}`),
        config.decorators.map((x) => `${x}/**/*.js`),
      ].flat(); // Achata os padrões glob

      // Use fast-glob para buscar arquivos de forma assíncrona
      const depFileArray = await Promise.all(
        depPatterns.map((pattern) => fastGlob(pattern, { dot: true }))
      );

      // Achata o array de arrays de resultados
      const dependencies = toArray(depFileArray).flat();

      dependencies.push(...layouts);
      dependencies.push(...partials);

      for (const dep of dependencies) {
        asset.invalidateOnFileChange(dep);
      }

      let isJsModule =
        asset.filePath.endsWith(".hbs") ||
        asset.filePath.endsWith(".handlebars");
      const data = Object.assign(
        {},
        {
          NODE_ENV: process.env.NODE_ENV,
        }
      );
      const newDelimiterOpen = "![[[";
      let result = wax.compile(content.replace(/{{(?!>)/g, newDelimiterOpen))(
        data
      );
      content = result.replace(
        new RegExp(
          newDelimiterOpen.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
          "g"
        ),
        "{{"
      );

      let contentSources = "";

      if (isJsModule) {
        const { html, sources } = addDep(content, asset);
        contentSources = sources;
        content = html;
      }

      if (isProduction) {
        const mayaConfigs = getMayaSettings(projectRoot);
        const mayaConfig =
          mayaConfigs && Array.isArray(mayaConfigs) && mayaConfigs[0]
            ? mayaConfigs[0]
            : {};
        const mayaIgnoreList =
          mayaConfig.ignoreList && Array.isArray(mayaConfig.ignoreList)
            ? mayaConfig.ignoreList
            : [];
        let defaultMayaIgnoreList;
        try {
          let modulePath = require.resolve(
            "parcel-transformer-maya/defaultIgnoreList.js",
            {
              paths: [asset.filePath, __dirname],
            }
          );
          defaultMayaIgnoreList = require(modulePath);
        } catch (err) {
          console.warn(
            "--parcel-transformer-hbs: Failed to require defaultMayaIgnoreList from parcel-transformer-maya"
          );
        }

        if (
          defaultMayaIgnoreList &&
          mayaConfig &&
          mayaConfig.useBootstrapIgnoreList
        ) {
          mayaIgnoreList.push(...defaultMayaIgnoreList.bootstrapIgnoreList);
        }
        const mayaHashSalt =
          mayaConfig && mayaConfig.hashSalt
            ? mayaConfig.hashSalt.toString()
            : "";

        content = htmlObfuscateClasses(content, mayaIgnoreList, mayaHashSalt);
      }

      if (!isJsModule) {
        await asset.setCode(content);
        return [asset];
      }
      if (isProduction) {
        content = minify(content, {
          continueOnParseError: true,
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
        });
      }

      const precompiled = Handlebars.precompile(content, {
        knownHelpers: handlebarsHelpers,
      });
      asset.setCode(`
        let sources = [];
        ${contentSources}
        let regex = new RegExp('https?://[^/]+/?');
        let tpl = ${precompiled};
        for(let i = 0; i < sources.length; i++){
          let dep = sources[i];
          let url = dep[1].replace(regex, '');
          sources[i][1] = url;
        }
        export {tpl, sources};`);
      asset.type = "js";
    } catch (err) {
      console.log("--parcel-transformer-hbs: Error compiling template.", err);
      throw new Error(
        "--parcel-transformer-hbs: Error compiling template.",
        err
      );
    }

    return [asset];
  },
});
