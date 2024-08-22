const cheerio = require("cheerio");
function cleanPath(path) {
  return path.replace(/\/{2,}/g, "/");
}
function addDep(html, asset, prefix = "___static/") {
  const $ = cheerio.load(html);

  // Selecione todas as tags de imagem e pictures
  const imageElements = $("img, picture");
  var sources = "";
  // Itera sobre cada elemento e atualiza atributos
  imageElements.each((i, el) => {
    const src = $(el).attr("src");
    const dataSrc = $(el).attr("data-src");
    const srcSet = $(el).attr("srcset");
   
    if (src) {
      sources =
        sources +
        `\n
      import src_${i} from '${cleanPath("./" + src)}';
       sources.push(["${src}", src_${i}]);
      \n`;
      $(el).attr("src", cleanPath(prefix + src));
    }
    if (dataSrc) {
      sources =
        sources +
        `\n
    import dataSrc_${i} from '${cleanPath("./" + dataSrc)}';
     sources.push(["${dataSrc}", dataSrc_${i}]);
    \n`;
      $(el).attr("src", cleanPath(prefix + dataSrc));
      $(el).attr("data-src", cleanPath(prefix + dataSrc));
    }
    if (srcSet) {
      sources =
        sources +
        `\n
    import srcSet_${i} from '${cleanPath("./" + srcSet)}';
     sources.push(["${srcSet}", srcSet_${i}]);
    \n`;
      $(el).attr("srcset", cleanPath(prefix + srcSet));
    }

    // Atualiza atributos nos elementos <source> dentro de <picture>
    $(el)
      .find("source")
      .each((i, sourceEl) => {
        const srcSetSource = $(sourceEl).attr("srcset");
        if (srcSetSource) {
          sources =
            sources +
            `\n
    import srcSetSrc_${i} from '${cleanPath("./" + srcSetSource)}';
     sources.push(["${srcSetSource}", srcSetSrc_${i}]);
    \n`;
          $(sourceEl).attr("srcset", cleanPath(prefix + srcSetSource));
        }
      });
  });

  // Retorna o HTML modificado
  return { html: $.html(), sources };
}
module.exports = addDep;
