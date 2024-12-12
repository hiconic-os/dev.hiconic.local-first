import { describe, it, expect } from "vitest";
import { Resource } from "@dev.hiconic/gm_resource-model"
import * as mm from "@dev.hiconic/gm_manipulation-model"
import * as me from "../src/managed-entities";
import { createEffect, createRoot } from "solid-js";
import { ReactivityScope } from "../src/entity-signals"

describe("entity signal tests", () => {
    it("binds an entity property signal and tests manipulation feedback avoidance", async () => {
        createRoot(async () => {
            await Promise.resolve();

            const entities = me.openEntities("test");
            const r1 = entities.createX(Resource).withId("abc");
            const scope = new ReactivityScope(entities.session);

            const [, setter] = scope.signal(r1).property("name");

            const manipulations = entities.manipulationBuffer.getCommitManipulations();

            expect(manipulations.length).toBe(1);
            expect(mm.InstantiationManipulation.isInstance(manipulations[0])).toBeTruthy();
            
            setter("Image");
            
            const manipulations2 = entities.manipulationBuffer.getCommitManipulations();
            expect(manipulations2.length).toBe(2);
            expect(mm.ChangeValueManipulation.isInstance(manipulations2[1])).toBeTruthy();
            
            r1.name = "Changed";

            const manipulations3 = entities.manipulationBuffer.getCommitManipulations();
            expect(manipulations3.length).toBe(3);
            expect(mm.ChangeValueManipulation.isInstance(manipulations3[2])).toBeTruthy();
        });
    });

    it("binds an entity property signal and tests mirroring value changes to the property", async () => {
        createRoot(async () => {
            await Promise.resolve();

            const entities = me.openEntities("test");
            const r1 = entities.createX(Resource).withId("abc");
            const scope = new ReactivityScope(entities.session);

            const [, setter] = scope.signal(r1).property("name");

            const name = "Image";

            setter(name);

            expect(r1.name).toBe(name);
        });

    });
    it("binds an entity signal and waits for it", async () => {
        createRoot(async () => {
            await Promise.resolve();

            const entities = me.openEntities("test");
            const r1 = entities.createX(Resource).withId("abc");
            const r2 = entities.createX(Resource).withId("opq");

            const scope = new ReactivityScope(entities.session);

            const entitySignal = scope.signal(r1).all();

            const collectedValues = new Array<any>();

            createEffect(() => {
                const { manipulation } = entitySignal.get();

                if (mm.ChangeValueManipulation.isInstance(manipulation)) {
                    const cvm = manipulation as mm.ChangeValueManipulation;
                    collectedValues.push(cvm.newValue);
                }
            });

            // should be collected
            r1.name = "Image";
            r1.mimeType = "image/png"

            // should not be collected
            r2.name = "something";

            expect(collectedValues.length).toBe(2);
            expect(collectedValues[0]).toBe(r1.name);
            expect(collectedValues[1]).toBe(r1.mimeType);
        });
    });
});