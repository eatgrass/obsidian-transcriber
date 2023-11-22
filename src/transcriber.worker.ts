import { pipeline, env, type Pipeline } from '@xenova/transformers'

self.onmessage = async ({ data }) => {
    console.log(data)
}

class PipelineFactory {
    static task: string
    static model: string
    static quantized: boolean
    static instance: Promise<Pipeline> | null

    private tokenizer: any

    constructor(tokenizer: any, model: string, quantized: boolean) {
        tokenizer = tokenizer
        model = model
        quantized = quantized
    }

    static async getInstance(
        callback?: (progress: any) => void,
    ): Promise<Pipeline> {
        if (this.instance == null) {
            this.instance = pipeline(this.task, this.model, {
                quantized: this.quantized,
                progress_callback: callback,
                revision: this.model.includes('/whisper-medium')
                    ? 'no_attentions'
                    : 'main',
            })
        }
        return this.instance
    }
}

self.onmessage = async ({ data }) => {
    let transcript = await transcribe(
        data.audio,
        data.model,
        data.multilingual,
        data.quantized,
        data.subtask,
        data.language,
    )

    if (transcript === null) return

    self.postMessage({
        status: 'complete',
        task: 'automatic-speech-recognition',
        data: transcript,
    })
}

class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
    static task = 'automatic-speech-recognition'
}

interface Chunk {
    tokens: any[]
    finalised: boolean
}

const transcribe = async (
    audio: any,
    model: string,
    multilingual: boolean,
    quantized: boolean,
    subtask: any,
    language: string,
) => {
    const isDistilWhisper = model.startsWith('distil-whisper/')

    let modelName = model
    if (!isDistilWhisper && !multilingual) {
        modelName += '.en'
    }
    const p = AutomaticSpeechRecognitionPipelineFactory
    if (p.model !== modelName || p.quantized !== quantized) {
        // Invalidate model if different
        p.model = modelName
        p.quantized = quantized

        if (p.instance !== null) {
            ;(await p.getInstance()).dispose()
            p.instance = null
        }
    }

    let transcriber = await p.getInstance((data) => {
        self.postMessage(data)
    })

    const time_precision =
        transcriber.processor.feature_extractor.config.chunk_length /
        transcriber.model.config.max_source_positions

    let chunks_to_process: Chunk[] = [
        {
            tokens: [],
            finalised: false,
        },
    ]

    function chunk_callback(chunk: any) {
        let last = chunks_to_process[chunks_to_process.length - 1]

        // Overwrite last chunk with new info
        Object.assign(last, chunk)
        last.finalised = true

        // Create an empty chunk after, if it not the last chunk
        if (!chunk.is_last) {
            chunks_to_process.push({
                tokens: [],
                finalised: false,
            })
        }
    }

    function callback_function(item: any) {
        let last = chunks_to_process[chunks_to_process.length - 1]

        // Update tokens of last chunk
        last.tokens = [...item[0].output_token_ids]

        // Merge text chunks
        // TODO optimise so we don't have to decode all chunks every time
        let data = (transcriber.tokenizer as any)._decode_asr(
            chunks_to_process,
            {
                time_precision: time_precision,
                return_timestamps: true,
                force_full_sequences: false,
            },
        )

        self.postMessage({
            status: 'update',
            task: 'automatic-speech-recognition',
            data: data,
        })
    }
    let output = await transcriber(audio, {
        // Greedy
        top_k: 0,
        do_sample: false,

        // Sliding window
        chunk_length_s: isDistilWhisper ? 20 : 30,
        stride_length_s: isDistilWhisper ? 3 : 5,

        // Language and task
        language: language,
        task: subtask,

        // Return timestamps
        return_timestamps: true,
        force_full_sequences: false,

        // Callback functions
        callback_function: callback_function, // after each generation step
        chunk_callback: chunk_callback, // after each chunk is processed
    }).catch((error: any) => {
        self.postMessage({
            status: 'error',
            task: 'automatic-speech-recognition',
            data: error,
        })
        return null
    })

    return output
}
