const fs = require('fs-extra');
const loaderUtils = require("loader-utils");
const path = require('path');
const { Transformer } = require('@parcel/plugin');
let Handlebars = require('handlebars');
let helpers = require('handlebars-helpers')();
let handlebarsWax = require('handlebars-wax');

const wax = handlebarsWax(Handlebars)
    .helpers(helpers);

const transformer = new Transformer({
    async transform({ asset }) {
        let content = await asset.getCode();

        // INLINE svg assets
        let regex = /<include src=(.*?)\/>/g;
        let includes = content.match(regex);

        let cache = {};

        for (let match in includes) {
            let file = includes[match];

            file = file.replace(/<include src=/g, "")
                .replace(/\/>/g, "")
                .replace(/"/g, "")
                .replace(/'/g, "");

            file = file.trim();

            // HACK this should be better but it works for me
            file = path.join(__dirname, '..', '..', 'src', 'template', file);

            let svg = (cache[file])
                ? cache[file]
                : fs.readFileSync(file, 'utf-8');

            cache[file] = (cache[file])
                ? cache[file]
                : svg;

            content = content.replace(includes[match], cache[file]);
        }

        // Load and register partials
      /*
        const partialsDir = path.join(process.cwd(), 'src', 'template', 'partials');
        if (await fs.pathExists(partialsDir)) {
            const partialFiles = await fs.readdir(partialsDir);

            partialFiles.forEach(async partialFile => {
                const partialName = path.basename(partialFile, path.extname(partialFile));
                const partialPath = path.join(partialsDir, partialFile);
                const partialContent = await fs.readFile(partialPath, 'utf-8');
                Handlebars.registerPartial(partialName, partialContent);
            });
        }
*/

        // Precompile Handlebars template
        const template = Handlebars.precompile(content, { knownHelpers: helpers });
        var runtimePath = require.resolve("handlebars/runtime");

        var slug = template
        ? "var Handlebars = require('handlebars/runtime');\n" +
          'function __default(obj) { return obj && (obj.__esModule ? obj["default"] : obj); }\n' +
          ' export default = (Handlebars["default"] || Handlebars).template(' +
          template +
          ");"
        : ' export default = function(){return "";};';
        console.log(slug);
        console.log("buildddddddddddddddddddddddddddddddddd");
        asset.setCode(slug);
        asset.type = "js";
        return [asset];
    },
});

module.exports = transformer;