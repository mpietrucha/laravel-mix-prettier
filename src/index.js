const fs = require("fs");
const mix = require("laravel-mix");
const { onExit } = require("gracy");
const map = require("deep-map-object");
const watcher = require("@parcel/watcher");
const prettier = require("@prettier/sync");
const { getAllFilesSync } = require("get-all-files");
const { build } = require("@mpietrucha/prettier-config/dist/builder");

class Prettier {
    register(options = {}) {
        this.queue = [];

        this.options = { source: "src", cache: ".prettier", ...options };
    }

    boot() {
        this.clean();

        getAllFilesSync(this.source)
            .toArray()
            .forEach((file) => {
                this.run(file);
            });

        this.watch &&
            watcher.subscribe(this.source, (error, events) => {
                this.enqueue(events);
            });
    }

    webpackConfig(config) {
        config.entry = this.map(config.entry);

        config.resolve.alias = this.map(config.resolve.alias);

        config.watchOptions.ignored = [this.source, "**/node_modules"];
    }

    enqueue(events) {
        events.forEach(({ type, path }) => {
            const destination = this.translate(path);

            const enqueued = this.queue.indexOf(path);

            if (type === "error") {
                this.purge(destination);

                return;
            }

            if (~enqueued) {
                this.queue.splice(enqueued, 1);

                return;
            }

            this.queue.push(path) && this.run(path, destination);
        });
    }

    run(filepath, destination) {
        const source = fs.readFileSync(filepath, "utf8");

        const options = build(filepath, this.options);

        const content = prettier.format(source, { filepath, ...options });

        fs.writeFileSync(filepath, content);

        fs.cpSync(filepath, destination || this.translate(filepath));
    }

    clean({ logLevel = "error", ...options } = {}) {
        const handler = this.purge.bind(this, this.cache);

        handler();

        onExit(handler, { logLevel, ...options });
    }

    purge(path) {
        fs.rmSync(path, {
            force: true,
            recursive: true,
        });
    }

    map(source) {
        const translator = this.translate.bind(this);

        return map(translator)(source);
    }

    translate(path) {
        if (this.watch) {
            return path.replace(this.source, this.cache);
        }

        return path;
    }

    get watch() {
        return Mix.isWatching();
    }

    get source() {
        return Mix.paths.root(this.options.source);
    }

    get cache() {
        return Mix.paths.root(this.options.cache);
    }
}

mix.extend("prettier", new Prettier());
