

export class Heap<T> {
    private heap: T[];
    private comparator: (a: T, b: T) => number;

    constructor(comparator: (a: T, b: T) => number) {
        this.heap = [];
        this.comparator = comparator;
    }

    peek(): T | undefined {
        return this.heap.length === 0 ? undefined : this.heap[0];
    }

    size(): number {
        return this.heap.length;
    }

    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    insert(value: T): void {
        this.heap.push(value);

        let index = this.heap.length - 1;
        while (index > 0) {
            const parentIndex = (index - 1) >> 1;

            // if heap[index] >= heap[parentIndex] we are done
            if (this.isFirstSmaller(parentIndex, index))
                return;

            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }

    removeSmallest(): T | undefined {
        if (this.heap.length === 0)
            return undefined;

        const smallest = this.heap[0];
        const last = this.heap.pop()!;

        if (this.heap.length === 0)
            return smallest;

        this.heap[0] = last;
        let index = 0;
        while (true) {
            const leftIndex = (index << 1) + 1;
            if (leftIndex >= this.heap.length)
                break;

            const rightIndex = leftIndex + 1;

            let smallerChildIndex = leftIndex;
            if (rightIndex < this.heap.length)
                if (this.isFirstSmaller(rightIndex, leftIndex))
                    smallerChildIndex = rightIndex;

            if (this.isFirstSmaller(index, smallerChildIndex))
                break;

            this.swap(index, smallerChildIndex);
            index = smallerChildIndex;
        }

        return smallest;
    }

    private isFirstSmaller(i1: number, i2: number): boolean {
        return this.comparator(this.heap[i1], this.heap[i2]) < 0;
    }

    private swap(i1: number, i2: number): void {
        const temp = this.heap[i1];
        this.heap[i1] = this.heap[i2];
        this.heap[i2] = temp;
    }
}