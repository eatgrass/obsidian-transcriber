import { Plugin, Notice, TFile } from 'obsidian'
// @ts-ignore
import Worker from 'transcriber.worker.ts'

export default class TranscriberPlugin extends Plugin {
    
    async onload() {
        let worker = Worker()
        let file: TFile = this.app.vault.getAbstractFileByPath(
            'englishpod_0003pb.mp3',
        ) as TFile
        let data = await this.app.vault.readBinary(file)
        const audioCTX = new AudioContext({
            sampleRate: 16000,
        })
        const audioData = await audioCTX.decodeAudioData(data)

        let audio

        if (audioData) {
            // setTranscript(undefined);
            // setIsBusy(true);
            if (audioData.numberOfChannels === 2) {
                const SCALING_FACTOR = Math.sqrt(2)

                let left = audioData.getChannelData(0)
                let right = audioData.getChannelData(1)

                audio = new Float32Array(left.length)
                for (let i = 0; i < audioData.length; ++i) {
                    audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2
                }
            } else {
                // If the audio is not stereo, we can just use the first channel:
                audio = audioData.getChannelData(0)
            }
            console.log(audio)
            worker.postMessage({
                audio,
                model: 'distil-whisper/distil-medium.en',
                multilingual: false,
                quantized: false,
                subtask: null,
                language: null,
            })
        }
    }
    onunload() {}

    async loadSettings() {}

    async saveSettings() {}
}
