import { describe, it, expect} from "vitest";
import { Accessor, Setter, createEffect, createRoot, createSignal} from "solid-js";

describe("signal tests", () => {
    it("tests an effect on a signal", async () => {
        expect(globalThis.window).toBeDefined();
        expect(globalThis.document).toBeDefined();

        const collected = new Array<number>();
        
        createRoot(async () => {
            await Promise.resolve();

            const [get, set] = createSignal(0);

            createEffect(() => {
                const value = get();
                console.log("executing effect with value: " + value);
                if (value != 0)
                    collected.push(value);
            });

            set(2);
            set(3);
            // do the checks after all effects happened
            expect(collected.length).toBe(2);
            expect(collected[0]).toBe(2);
            expect(collected[1]).toBe(3);
        });
    });
});
