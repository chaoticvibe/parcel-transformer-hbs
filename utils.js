const fs = require("fs");
const path = require("path");
const farmhash = require("farmhash");
const htmlTags = require("html-tags");
const cheerio = require("cheerio");
const replaceClasses = require("replace-classes");
function loadUserConfig() {
  const file = path.resolve(process.cwd(), "handlebars.config.js");
  const flavors = [
    file, // handlebars.config.js
    file.replace(".js", ".json"), // handlebars.config.json
    file.replace("handlebars.", "hbs."), // hbs.config.js
    file.replace("handlebars.", "hbs.").replace(".js", ".json"), // hbs.config.json
  ];

  if (fs.existsSync(flavors[0])) {
    // eslint-disable-line no-sync
    return require(flavors[0]); // eslint-disable-line global-require
  }

  if (fs.existsSync(flavors[1])) {
    // eslint-disable-line no-sync
    return JSON.parse(fs.readFileSync(flavors[1], { encoding: "utf-8" })); // eslint-disable-line no-sync
  }

  if (fs.existsSync(flavors[2])) {
    // eslint-disable-line no-sync
    return require(flavors[2]); // eslint-disable-line global-require
  }

  if (fs.existsSync(flavors[3])) {
    // eslint-disable-line no-sync
    return JSON.parse(fs.readFileSync(flavors[3], { encoding: "utf-8" })); // eslint-disable-line no-sync
  }

  return {};
}
function createGlobIgnoringFunction(patterns) {
  // Converte cada padrão em uma expressão regular ou mantém como string literal
  const regexPatterns = patterns.map((pattern) => {
    if (pattern.includes("*")) {
      // É uma glob pattern, converte para regex
      return new RegExp("^" + pattern.replace(/\*/g, ".*") + "$", "i");
    } else {
      // É uma string literal, converte para regex escapando caracteres especiais
      return new RegExp(
        "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
        "i"
      );
    }
  });

  // Retorna uma função que verifica se uma string corresponde a qualquer uma das expressões regulares
  return function (str) {
    return !regexPatterns.some((regex) => regex.test(str));
  };
}

const parseSimpleLayout = (str, opts) => {
  const layoutPattern = /{{!<\s+([A-Za-z0-9._\-/]+)\s*}}/;
  const matches = str.match(layoutPattern);

  if (matches) {
    let layout = matches[1];

    if (opts.layouts && layout[0] !== ".") {
      layout = path.resolve(opts.layouts, layout);
    }

    const hbsLayout = path.resolve(process.cwd(), `${layout}.hbs`);

    if (fs.existsSync(hbsLayout)) {
      // eslint-disable-line no-sync
      const content = fs.readFileSync(hbsLayout, { encoding: "utf-8" }); // eslint-disable-line no-sync
      return content.replace("{{{body}}}", str);
    }

    const handlebarsLayout = hbsLayout.replace(".hbs", ".handlebars");

    if (fs.existsSync(handlebarsLayout)) {
      // eslint-disable-line no-sync
      const content = fs.readFileSync(handlebarsLayout, { encoding: "utf-8" }); // eslint-disable-line no-sync
      return content.replace("{{{body}}}", str);
    }
  }

  return str;
};
const hashClass = (name) => {
  const hash = farmhash.hash32(name).toString(36);
  const firstChar = hash.charAt(0);
  if (!/[a-z]/.test(firstChar)) {
    return "x" + hash;
  }
  return hash;
};
const findProjectRoot = (event, options) => {
  if (options.env["npm_package_json"]) {
    return path.dirname(options.env["npm_package_json"]);
  }
  if (options.env["PNPM_SCRIPT_SRC_DIR"]) {
    return options.env["PNPM_SCRIPT_SRC_DIR"];
  }
  return options.projectRoot;
};

const getMayaSettings = (projectRoot) => {
  let packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"))
  );
  var section = packageJson["parcelMaya"];
  if (Array.isArray(section)) {
    return section;
  } else {
    return [Object.assign({}, section)];
  }
};
const listAllHtmlClasses = (html) => {
  const $ = cheerio.load(html);
  const classes = new Set();

  // Itera sobre todos os elementos que possuem um atributo 'class'
  $("[class]").each((i, el) => {
    // Pega o valor do atributo 'class' e separa em classes individuais
    const classList = $(el).attr("class").split(/\s+/);
    classList.forEach((className) => classes.add(className));
  });

  // Converte o Set em uma array para retornar todas as classes
  return Array.from(classes);
};
const htmlObfuscateClasses = (html, mayaIgnoreList, hashSalt = "") => {
  mayaIgnoreList.push(...htmlTags);
  const shouldIgnore = createGlobIgnoringFunction([
    ...mayaIgnoreList,
    ...htmlTags,
  ]);
  let allClasses = listAllHtmlClasses(html);
  allClasses = Array.isArray(allClasses) ? allClasses : [];
  allClasses = allClasses.filter((classe) =>{
    return shouldIgnore(classe);
  });
  const hashClasses = {};
  allClasses.forEach((classe) => {
    hashClasses[classe] = hashClass(hashSalt + classe);
  })
  return replaceClasses(html, hashClasses);
};
module.exports = {
  loadUserConfig,
  parseSimpleLayout,
  findProjectRoot,
  htmlObfuscateClasses,
  hashClass,
  getMayaSettings,
  createGlobIgnoringFunction,
};
