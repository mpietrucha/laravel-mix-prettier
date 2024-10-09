const fs = require('fs')
const mix = require('laravel-mix')
const { onExit } = require('gracy')
const map = require('deep-map-object')
const inside = require('path-is-inside')
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

        this.initial().forEach(file => this.run(file))

        this.watch && watcher.subscribe(this.source, (error, events) => this.enqueue(events))
    }

    webpackConfig(config) {
        config.entry = this.map(config.entry)

        config.resolve.alias = this.map(config.resolve.alias)

        config.watchOptions.ignored = [this.source, '**/node_modules']
    }

    assert() {
        if (!fs.existsSync(this.source)) {
            throw new Error('Source directory does not exists.')
        }

        if (inside(this.cache, this.source)) {
            throw new Error('Cache directory cannot be inside source.')
        }

        if (inside(this.source, this.cache)) {
            throw new Error('Source directory cannot be inside cache.')
        }
    }

    clean({ logLevel = 'error', ...options } = {}) {
        const handler = this.purge.bind(this, this.cache)

        handler()

        onExit(handler, { logLevel, ...options })
    }

    initial() {
        const includes = this.options.includes || [this.root('package.json')]

        return [...includes, ...getAllFilesSync(this.source).toArray()]
    }

    enqueue(events) {
        events.forEach(this.dispatch.bind(this))
    }

    dispatch({ type, path }) {
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
    }

    run(filepath, destination) {
        const source = fs.readFileSync(filepath, 'utf8')

        const options = build(filepath, this.options)

        const content = prettier.format(source, { filepath, ...options })

        fs.writeFileSync(filepath, content)

        this.synchronize(filepath, destination)
    }

    synchronize(source, destination) {
        destination ||= this.translate(source)

        if (source === destination) {
            return
        }

        fs.cpSync(source, destination)
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
