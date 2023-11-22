import { Plugin, Notice } from 'obsidian'
// @ts-ignore
import Worker from 'transcriber.worker.ts'

export default class TranscriberPlugin extends Plugin {
    async onload() {
        let worker = Worker()
        worker.postMessage(['hello', 'world'])
    }

    onunload() {}

    async loadSettings() {}

    async saveSettings() {}
}
