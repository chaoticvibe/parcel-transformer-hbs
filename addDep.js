const cheerio = require("cheerio");
function cleanPath(path) {
  return path.replace(/\/{2,}/g, '/');
}
function addDep(html, asset, prefix = "___static_path_to_replace/") {
  const $ = cheerio.load(html);

  // Selecione todas as tags de imagem e pictures
  const imageElements = $('img, picture');

  // Itera sobre cada elemento e atualiza atributos
  imageElements.each((i, el) => {
    const src = $(el).attr('src');
    const dataSrc = $(el).attr('data-src');
    const srcSet = $(el).attr('srcset');

    if (src) {
      const dependency = asset.addURLDependency(src);

      $(el).attr('src', cleanPath(prefix + src));
    }
    if (dataSrc) {
      const dependency = asset.addURLDependency(dataSrc);

      $(el).attr('data-src', cleanPath(prefix + dataSrc));
    }
    if (srcSet) {
      const dependency = asset.addURLDependency(srcSet);

      $(el).attr('srcset', cleanPath(prefix + srcSet));
    }

    // Atualiza atributos nos elementos <source> dentro de <picture>
    $(el).find('source').each((i, sourceEl) => {
      const srcSetSource = $(sourceEl).attr('srcset');
      if (srcSetSource) {
        const dependency = asset.addURLDependency(srcSetSource);
        $(sourceEl).attr('srcset', cleanPath(prefix + srcSetSource));
      }
    });
  });

  // Retorna o HTML modificado
  return $.html();
}
module.exports = addDep;