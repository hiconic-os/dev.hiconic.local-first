import { lang } from "@dev.hiconic/tf.js_hc-js-api";

export type DeferredFunction = (this: Continuation, ...args: any[]) => void;
export type ContinuationConsumer<E, C> = (this: Continuation, el: E, context: C) => void;

class AccessiblePromise<T> {
    public promise: Promise<T>;
    public resolve;
    public reject;

    constructor() {
        let res: (value: T) => void;
        let rej: (reason?: any) => void;
        
        this.promise = new Promise<T>((resolve, reject) => {
            res = resolve;
            rej = reject;
        });

        this.resolve = res!;
        this.reject = rej!;
    }
}

export abstract class Continuation {
    readonly asyncThreshold = 20;

    private insertAfter?: ContinuationTaskNode<any>;
    private nextNode?: ContinuationTaskNode<any>;
    
    private readonly messageChannel = new MessageChannel();

    private promise: AccessiblePromise<void>;

    constructor() {
        this.messageChannel.port1.onmessage = () => this.work();
        this.promise = new AccessiblePromise<void>();
    }

    protected async wait(): Promise<void> {
        if (!this.nextNode)
            return; 
        
        await this.promise.promise;
        this.promise = new AccessiblePromise<void>();
    }

    protected forEachOf<E>(iterable: Iterable<E>, consumer: (e: E) => void): void {
        this.enqueue(iterable[Symbol.iterator](), consumer);
    }

    protected forEachOfIterator<E>(iterator: Iterator<E>, consumer: (e: E) => void): void {
        this.enqueue(iterator, consumer);
    }

    protected forEachOfIterable<E>(iterable: lang.Iterable<E>, consumer: (e: E) => void): void {
        this.forEachOf(iterable.iterable(), consumer);
    }

    protected runAfterPending(task: () => void) {
        this.forEachOfIterator(function *() { yield undefined }(), task);
    }

    private enqueue<E>(iterator: Iterator<E>, consumer: (e: E) => void): void {

        while (true) {
            const res = iterator.next();

            if (res.done)
                break;

            const node = new ContinuationTaskNode(res.value, consumer);

            if (this.insertAfter) {
                node.next = this.insertAfter.next;
                this.insertAfter.next = node;
                this.insertAfter = node;
            }
            else {
                this.nextNode = this.insertAfter = node;
                this.schedule();
            }
        }
    }

    private schedule(): void {
        this.messageChannel.port2.postMessage(null);
    }

    private work(): void {
        try {
            let startTime = Date.now();

            const threshold = this.asyncThreshold;

            while (this.nextNode) {
                const node = this.nextNode;
                node.consumer(node.value);
                this.insertAfter = this.nextNode = node.next;

                const curTime = Date.now();

                if ((curTime - startTime) > threshold) {
                    this.schedule();
                    return;
                }

                
            }

            // the whole process has ended
            this.promise.resolve();
        }
        catch (e) {
            this.promise.reject(e);
        }
    }
}

class ContinuationTaskNode<E> {
    next?: ContinuationTaskNode<any>;
    readonly value: E;
    readonly consumer: (e: E) => void;
    
    constructor(value: E, consumer: (e: E) => void) {
        this.value = value;
        this.consumer = consumer;
    }
}


