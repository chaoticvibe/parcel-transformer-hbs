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
// Function to extract partials from a Handlebars template
function extractPartials(content) {
  const partialRegex = /{{>\s*([^}\s]+)\s*}}/g;
  let match;
  const partials = [];
  while (match = partialRegex.exec(content)) {
      partials.push(match[1]);
  }
  return partials;
}
// Function to map partial names to file p
// Função para mapear os nomes dos partials para os caminhos dos arquivos
function mapPartialsToFilePaths(partials, baseDir) {
  const dir = baseDir; // Obtém apenas o diretório, sem o nome do arquivo e extensão
  return partials.reduce((map, partial) => {
    const partialPath = path.join(dir, partial); 
    map[partial] = partialPath;
    return map;
  }, {});
}

// Função para converter partials em caminhos de arquivos
async function partialsToFilePaths(partials, paths, partialsFiles = {}, alreadyChecked = []) {
  const { partialsDir, layoutsDir } = paths;

  if (!partials.length) {
    return [];
  }

  if (!partialsDir && !layoutsDir) {
    return [];
  }
  // Mapeia os nomes dos partials para seus caminhos
  const partialsMap = partialsDir ? mapPartialsToFilePaths(partials, partialsDir) : {};
  const layoutsMap = layoutsDir ? mapPartialsToFilePaths(partials, layoutsDir) : {};
  // Junta os caminhos dos partials e layouts
  const allPaths = [...Object.values(partialsMap), ...Object.values(layoutsMap)];

  // Filtra e verifica os partials existentes
  const allPartials = await Promise.all(
    allPaths.map(async (partialPath) => {
      const file = partialsFiles.find((data) => data.partial === partialPath);
      if(file && alreadyChecked.includes(file.fullPath)){
        return null;
      }
      return file ? file.fullPath : null; // Retorna o caminho apenas se existir
    })
  );

  // Remove valores nulos/undefined (arquivos que não existem)
  const filteredPartials = allPartials.filter(Boolean);

  // Se não restam partials, retorna uma lista vazia
  if (!filteredPartials.length) {
    return [];
  }

  // Adiciona os partials recém-verificados à lista de já verificados
  const newAlreadyChecked = [...alreadyChecked, ...filteredPartials];

  return newAlreadyChecked;
}
function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }

  return arr1.every((value, index) => value === arr2[index]);
}
async function allFilePaths(content, paths, allPartials, allExtracted = [], alreadyChecked = []) {   
  // Se já verificamos todos os arquivos, retornamos os que extraímos até agora
  if (alreadyChecked.length && allExtracted.length && arraysEqual(alreadyChecked, allExtracted)) {
      return allExtracted;
  }

  // Marcamos os extraídos atuais como já verificados
  alreadyChecked = [...alreadyChecked, ...allExtracted];

  // Extrai novos partials deste conteúdo e transforma em caminhos completos
  let newPartials = await partialsToFilePaths(
      extractPartials(content),
      paths, allPartials, alreadyChecked
  );
  // Filtra partials já verificados
  newPartials = newPartials.filter(partial => !alreadyChecked.includes(partial));

  // Lê o conteúdo de cada partial e chama a função recursivamente
  let allPaths = await Promise.all(newPartials.map(async (partialPath) => {
      const file = allPartials.find((data)=>{ return data.filePath === partialPath});
    
      let content = file && file.content ? file.content : null;
      try{
        content = !content && await fs.exists(partialPath) ? await fsp.readFile(partialPath, 'utf8') : content;
      }catch(err){ 
      }
      return !content ? allExtracted : await allFilePaths(content, paths, allPartials, newPartials, alreadyChecked);
  }));

  // Achata os arrays de caminhos retornados
  return [...new Set(allExtracted.concat(...allPaths))];
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

   
      const layoutsGlob = config.layouts.map((x) => `${x}/**/*.{htm,html,hbs}`);
      const partialsGlob = config.partials.map(
        (x) => `${x}/**/*.{html,html,hbs}`
      );
      const allRegisters = [...layoutsGlob, ...partialsGlob];

      let registers = await Promise.all(
        allRegisters.map(async (glob) => {
          const filePaths = await fastGlob(glob, { cwd: projectRoot });

          // Lê o conteúdo de todos os arquivos de forma assíncrona
          const fileContents = await Promise.all(
            filePaths.map(async (filePath) => {
              const fullPath = path.join(projectRoot, filePath);
              const content = await fsp.readFile(fullPath, "utf-8");
              const { dir, name } = path.parse(filePath); // 'name' é o nome do arquivo sem a extensão
              const partial = path.join(projectRoot, dir, name); 
              return { filePath, partial, fullPath, content, glob: glob.replace(/\/[*?{[].*$/, "") + "/" };
            })
          );
          return fileContents.flat();
        })
      );
      registers = registers.flat();

      const newDelimiterOpen = "![[[";
      const registerPartials = await Promise.all(
        registers.map(async (register) => {
          const { filePath, glob, content } = register;
        
          const relativePath = path
            .relative(projectRoot, filePath)
            .replace(/\\/g, "/"); // Converte para formato Unix
          const name = relativePath.replace(path.extname(relativePath), "").replace(glob, ""); // Remove a extensão
          const partial = {};
          partial[name] = content.replace(/{{(?!>)/g, newDelimiterOpen)
          return partial;
        })
      );

      wax.partials(Object.assign({}, ...registerPartials));

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
      const deps = await allFilePaths(content, {layoutsDir, partialsDir}, registers);
      dependencies.push(...deps);
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
        asset.setCode(content);
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
      console.error("--parcel-transformer-hbs: Error compiling template.", err);
      throw new Error(
        "--parcel-transformer-hbs: Error compiling template.",
        err
      );
    }

    return [asset];
  },
});
