const fs = require("fs");
const path = require("path");
const farmhash = require("farmhash");
const htmlTags = require("html-tags");
const cheerio = require("cheerio");
const isBlank = require('is-blank');

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

const hashClass = (name) => {
  const hash = farmhash.hash32(name).toString(36);
  const firstChar = hash.charAt(0);
  if (!/[a-z]/.test(firstChar)) {
    return "x" + hash;
  }
  return hash;
};

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
const listAllHtmlClasses = (html) => {
  try {
    const $ = cheerio.loadBuffer(Buffer.from(html), { xml: { xmlMode: false, decodeEntities: false }});
    const classes = new Set();

    // Itera sobre todos os elementos que possuem um atributo 'class'
    $("[class]").each((i, el) => {
      // Pega o valor do atributo 'class' e separa em classes individuais
      const allClasses = $(el).attr("class");
      
      const classList = allClasses && allClasses.length ? allClasses.split(/\s+/) : [];
      classList.forEach((className) => classes.add(className.trim()));
    });

    // Converte o Set em uma array para retornar todas as classes
    return Array.from(classes);
  } catch (err) {
    console.log(err);
    return [];
  }
};

function replaceClasses (html, classes) {
  if (typeof html !== 'string' || typeof classes !== 'object') {
    throw new TypeError('replace-classes expected an html string and a class object')
  }

  if (isBlank(classes)) {
    return html
  }

  var html = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false }})

  html('*').each(function (_, element) {
    var _this = html(this)

    Object.keys(classes).forEach(function (klass) {
      if (_this.hasClass(klass)) {
        _this.removeClass(klass)
        _this.addClass(classes[klass])
      }
    })
  })

  return html.html()
}
const htmlObfuscateClasses = (
  html = "",
  mayaIgnoreList = [],
  hashSalt = ""
) => {
  try {
    html = typeof html === "string" && html.length ? html : "";
    hashSalt =
      typeof hashSalt === "string" && hashSalt.length ? hashSalt : "lucifer";
    mayaIgnoreList =
      mayaIgnoreList && Array.isArray(mayaIgnoreList) ? mayaIgnoreList : [];
    const shouldIgnore = createGlobIgnoringFunction([
      ...mayaIgnoreList,
      ...htmlTags,
    ]);
    let allClasses = listAllHtmlClasses(html);
    allClasses = Array.isArray(allClasses) ? allClasses : [];
    allClasses = allClasses.filter((classe) => {
      return classe && shouldIgnore(classe);
    });
    if (!allClasses.length) {
      return html;
    }
    const hashClasses = {};
    allClasses.forEach((classe) => {
      hashClasses[classe] = hashClass(hashSalt + classe);
    });

    return replaceClasses(html, hashClasses);
  } catch (err) {
    return html;
  }
};

function defaultHelperNamer(file) {
  return defaultNamer(file).replace(".helper", "");
}

function defaultNamer(file) {
  var segments = file
    .replace(process.cwd() + "/src/templates/", "")
    .replace(process.cwd() + "src/templates/", "");
  return removeExtension(segments);
}

function getRelativePath(path) {
  var deep = path.split("/").length - 2;
  var rootLayer = 0;

  if (deep === rootLayer) {
    return "./";
  }

  return "../".repeat(deep);
}

function removeExtension(path) {
  return path.slice(0, path.lastIndexOf("."));
}
module.exports = {
  defaultHelperNamer,
  defaultNamer,
  getRelativePath,
  removeExtension,
  loadUserConfig,
  findProjectRoot,
  htmlObfuscateClasses,
  hashClass,
  getMayaSettings,
  createGlobIgnoringFunction,
};
