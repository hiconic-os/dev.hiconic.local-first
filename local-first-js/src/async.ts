export class AccessiblePromise<T> {
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