const fs = require('fs')
const path = require('path')
const frontMatter = require('front-matter');
const handlebars = require('handlebars');
const handlebarsWax = require('handlebars-wax');
const handlebarsLayouts = require('handlebars-layouts');
const handlebarsHelpersPackage = require('handlebars-helpers');
const { Transformer } = require('@parcel/plugin');

const handlebarsHelpers = handlebarsHelpersPackage();
const { loadUserConfig, parseSimpleLayout } = require('./utils');

const userConfig = loadUserConfig();
const config = Object.assign({}, {
    data: 'src/markup/data',
    decorators: 'src/markup/decorators',
    helpers: 'src/markup/helpers',
    layouts: 'src/markup/layouts',
    partials: 'src/markup/partials',
}, userConfig);



const wax = handlebarsWax(handlebars)
    .helpers(handlebarsLayouts)
    .helpers(handlebarsHelpers)
    .helpers(`${config.helpers}/**/*.js`)
    .data(`${config.data}/**/*.{json,js}`)
    .decorators(`${config.decorators}/**/*.js`)
    .partials(`${config.layouts}/**/*.{hbs,handlebars,js}`)
    .partials(`${config.partials}/**/*.{hbs,handlebars,js}`);

const transformer = new Transformer({
    async transform({ asset }) {

        let code = await asset.getCode();

        // INLINE svg assets
        let regex = /<include src=(.*?)\/>/g;
        let includes = code.match(regex);
        let cache = {}
        for (let match in includes) {

            let file = includes[match]

            file = file.replace(/<include src=/g, "")
                .replace(/\/>/g, "")
                .replace(/"/g, "")
                .replace(/'/g, "");

            // HACK this should be better but it works for me
            file = path.join(__dirname, '..', '..', 'src', 'frontend', file)

            let svg = (cache[file])
                ? cache[file]
                : fs.readFileSync(file, 'utf-8')

            cache[file] = (cache[file])
                ? cache[file]
                : svg

            code = code.replace(includes[match], cache[file])

        }

        const frontmatter = frontMatter(code);
        const content = parseSimpleLayout(frontmatter.body, config);
        const data = Object.assign({}, frontmatter.attributes, { NODE_ENV: process.env.NODE_ENV });
        const html = wax.compile(content)(data);

        asset.type = 'html';
        asset.setCode(html);

        return [asset];

    },
});





module.exports = transformer;
