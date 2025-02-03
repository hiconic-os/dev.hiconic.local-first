import { describe, expect, it } from "vitest";
import { Heap } from "../../src/utils/heap.js";

describe("heap", () => {

    it("adding and removing", () => {
        const heap = new Heap<number>((a, b) => a - b);

        heap.insert(5);
        heap.insert(6);
        heap.insert(4);
        heap.insert(1);
        heap.insert(2);
        heap.insert(3);

        for (let i = 1; i <= 6; i++) {
            const smallest = heap.removeSmallest();
            expect(smallest).toBe(i);
        }

        expect(heap.isEmpty).toBeTruthy();
    });

});