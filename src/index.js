const fs = require('fs')
const mix = require('laravel-mix')
const { onExit } = require('gracy')
const map = require('deep-map-object')
const inside = require("path-is-inside")
const watcher = require('@parcel/watcher')
const { getAllFilesSync } = require('get-all-files')
const { build, prettier } = require('@mpietrucha/prettier-config/dist/builder')

class Prettier {
    register(options = {}) {
        this.queue = []

        this.options = { source: 'src', cache: '.prettier', ...options }
    }

    boot() {
        this.assert()

        this.clean()

        const bootstrap = this.run.bind(this)

        this.includes().forEach(bootstrap)

        getAllFilesSync(this.source).toArray().forEach(bootstrap)

        this.watch && watcher.subscribe(this.source, (error, events) => this.enqueue(events))
    }

    webpackConfig(config) {
        config.entry = this.map(config.entry)

        config.resolve.alias = this.map(config.resolve.alias)

        config.watchOptions.ignored = [this.source, '**/node_modules']
    }

    enqueue(events) {
        events.forEach(({ type, path }) => {
            const destination = this.translate(path)

            const enqueued = this.queue.indexOf(path)

            if (type === 'error') {
                this.purge(destination)

                return
            }

            if (~enqueued) {
                this.queue.splice(enqueued, 1)

                return
            }

            this.queue.push(path) && this.run(path, destination)
        })
    }

    run(filepath, destination) {
        const source = fs.readFileSync(filepath, 'utf8')

        const options = build(filepath, this.options)

        const content = prettier.format(source, { filepath, ...options })

        fs.writeFileSync(filepath, content)

        fs.cpSync(filepath, destination || this.translate(filepath))
    }

    includes() {
        return this.options.includes || [this.root('package.json')]
    }

    assert() {
        if (! inside(this.source, this.cache)) {
            return
        }

        throw new Error('Cache directory cannot be inside source.')
    }

    clean({ logLevel = 'error', ...options } = {}) {
        const handler = this.purge.bind(this, this.cache)

        handler()

        onExit(handler, { logLevel, ...options })
    }

    purge(path) {
        fs.rmSync(path, {
            force: true,
            recursive: true,
        })
    }

    map(source) {
        const translator = this.translate.bind(this)

        return map(translator)(source)
    }

    translate(path) {
        if (this.watch) {
            return path.replace(this.source, this.cache)
        }

        return path
    }

    root(children) {
        return Mix.paths.root(children)
    }

    get watch() {
        return Mix.isWatching()
    }

    get source() {
        return this.root(this.options.source)
    }

    get cache() {
        return this.root(this.options.cache)
    }
}

mix.extend('prettier', new Prettier())
