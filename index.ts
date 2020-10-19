// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Ian Osgood
// Optimized by Roy Williams
// modified for Node.js by Isaac Gouy
// multi thread by Andrey Filatkin

import { Worker as NodeWorker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as os from 'os';

enum MessageVariant {
    Sab,
    Au,
    Atu,
    Exit,
}

interface SabMessage {
    variant: MessageVariant.Sab;
    data: Float64Array;
}

interface AuMessage {
    variant: MessageVariant.Au;
    vec1: UVWField,
    vec2: UVWField,
}

interface AtuMessage {
    variant: MessageVariant.Atu;
    vec1: UVWField,
    vec2: UVWField,
}

interface ExitMessage {
    variant: MessageVariant.Exit;
}

type Message = SabMessage | AuMessage | AtuMessage | ExitMessage;

interface UVW {
    u: Float64Array;
    v: Float64Array;
    w: Float64Array;
}

type UVWField = keyof UVW;

const bytesPerFloat = Float64Array.BYTES_PER_ELEMENT;

if (isMainThread) {
    mainThread(+process.argv[2]);
} else {
    workerThread(workerData);
}

async function mainThread(n: number) {
    const sab = new SharedArrayBuffer(3 * bytesPerFloat * n);
    const u = new Float64Array(sab, 0, n).fill(1);
    const v = new Float64Array(sab, bytesPerFloat * n, n);

    const workers = new Set<NodeWorker>();
    startWorkers();

    for (let i = 0; i < 10; i++) {
        await atAu('u', 'v', 'w');
        await atAu('v', 'u', 'w');
    }

    stopWorkers();

    let vBv = 0;
    let vv = 0;
    for (let i = 0; i < n; i++) {
        vBv += u[i] * v[i];
        vv += v[i] * v[i];
    }

    const result = Math.sqrt(vBv / vv);

    console.log(result.toFixed(9));

    async function atAu(u: UVWField, v: UVWField, w: UVWField) {
        await work({ variant: MessageVariant.Au, vec1: u, vec2: w });
        await work({ variant: MessageVariant.Atu, vec1: w, vec2: v });
    }

    function startWorkers() {
        const cpus = os.cpus().length;
        const chunk = Math.ceil(n / cpus);

        for (let i = 0; i < cpus; i++) {
            const start = i * chunk;
            let end = start + chunk;
            if (end > n) {
                end = n;
            }
            const worker = new NodeWorker(__filename, {workerData: {n, start, end}});

            worker.postMessage({ variant: MessageVariant.Sab, data: sab });
            workers.add(worker);
        }
    }

    function work(message: Message) {
        return new Promise(resolve => {
            let wait = 0;
            workers.forEach(worker => {
                worker.postMessage(message);
                worker.once('message', () => {
                    wait--;
                    if (wait === 0) {
                        resolve();
                    }
                });
                wait++;
            });
        });
    }

    function stopWorkers() {
        workers.forEach(worker => worker.postMessage({ variant: MessageVariant.Exit }));
    }
}

function workerThread({n, start, end}: {n: number, start: number, end: number}) {
    let data: UVW | undefined = undefined;

    if (parentPort === null) {
        return;
    }

    parentPort.on('message', (message: Message) => {
        switch (message.variant) {
            case MessageVariant.Sab:
                data = {
                    u: new Float64Array(message.data, 0, n),
                    v: new Float64Array(message.data, bytesPerFloat * n, n),
                    w: new Float64Array(message.data, 2 * bytesPerFloat * n, n),
                };
                break;
            case MessageVariant.Au:
                if (data === undefined) {
                    throw Error('Au received before Sab');
                }
                au(data[message.vec1], data[message.vec2]);
                parentPort!.postMessage({});
                break;
            case MessageVariant.Atu:
                if (data === undefined) {
                    throw Error('Atu received before Sab');
                }
                atu(data[message.vec1], data[message.vec2]);
                parentPort!.postMessage({});
                break;
            case MessageVariant.Exit:
                process.exit();
        }
    });

    function au(u: Float64Array, v: Float64Array) {
        for (let i = start; i < end; i++) {
            let t = 0;
            for (let j = 0; j < n; j++) {
                t += u[j] / a(i, j);
            }
            v[i] = t;
        }
    }

    function atu(u: Float64Array, v: Float64Array) {
        for (let i = start; i < end; i++) {
            let t = 0;
            for (let j = 0; j < n; j++) {
                t += u[j] / a(j, i);
            }
            v[i] = t;
        }
    }

    function a(i: number, j: number) {
        return ((i + j) * (i + j + 1) >>> 1) + i + 1;
    }
}
