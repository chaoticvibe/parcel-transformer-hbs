const fs = require('fs')
const path = require('path')
const frontMatter = require('front-matter');
const handlebars = require('handlebars');
const handlebarsWax = require('handlebars-wax');
const handlebarsLayouts = require('handlebars-layouts');
const handlebarsHelpersPackage = require('handlebars-helpers');
const { Transformer } = require('@parcel/plugin');

const handlebarsHelpers = handlebarsHelpersPackage();

// const { loadUserConfig, parseSimpleLayout } = require('./utils');

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

function loadUserConfig() {
    const file = path.resolve(process.cwd(), 'handlebars.config.js');
    const flavors = [
        file, // handlebars.config.js
        file.replace('.js', '.json'), // handlebars.config.json
        file.replace('handlebars.', 'hbs.'), // hbs.config.js
        file.replace('handlebars.', 'hbs.').replace('.js', '.json'), // hbs.config.json
    ];

    if (fs.existsSync(flavors[0])) { // eslint-disable-line no-sync
        return require(flavors[0]); // eslint-disable-line global-require
    }

    if (fs.existsSync(flavors[1])) { // eslint-disable-line no-sync
        return JSON.parse(fs.readFileSync(flavors[1], { encoding: 'utf-8' })); // eslint-disable-line no-sync
    }

    if (fs.existsSync(flavors[2])) { // eslint-disable-line no-sync
        return require(flavors[2]); // eslint-disable-line global-require
    }

    if (fs.existsSync(flavors[3])) { // eslint-disable-line no-sync
        return JSON.parse(fs.readFileSync(flavors[3], { encoding: 'utf-8' })); // eslint-disable-line no-sync
    }

    return {};
}

const parseSimpleLayout = (str, opts) => {
    const layoutPattern = /{{!<\s+([A-Za-z0-9._\-/]+)\s*}}/;
    const matches = str.match(layoutPattern);

    if (matches) {
        let layout = matches[1];

        if (opts.layouts && layout[0] !== '.') {
            layout = path.resolve(opts.layouts, layout);
        }

        const hbsLayout = path.resolve(process.cwd(), `${layout}.hbs`);

        if (fs.existsSync(hbsLayout)) { // eslint-disable-line no-sync
            const content = fs.readFileSync(hbsLayout, { encoding: 'utf-8' }); // eslint-disable-line no-sync
            return content.replace('{{{body}}}', str);
        }

        const handlebarsLayout = hbsLayout.replace('.hbs', '.handlebars');

        if (fs.existsSync(handlebarsLayout)) { // eslint-disable-line no-sync
            const content = fs.readFileSync(handlebarsLayout, { encoding: 'utf-8' }); // eslint-disable-line no-sync
            return content.replace('{{{body}}}', str);
        }
    }

    return str;
};



module.exports = transformer;
