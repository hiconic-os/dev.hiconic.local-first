import { describe, it, expect } from "vitest";
import { Resource } from "@dev.hiconic/gm_resource-model"
import * as mm from "@dev.hiconic/gm_manipulation-model"
import { reflection as refl, T } from "@dev.hiconic/tf.js_hc-js-api";
import * as me from "../src/managed-entities";

function outputManipulations(manipulations: mm.Manipulation[]) {
    for (const manipulation of manipulations) {
        console.log(manipulation.EntityType().getTypeSignature())
    }
}

describe("managed entities", () => {
    it("creates entities and accesses an entity by globalId", async () => {
        const entities = me.openEntities("test");

        const r1 = entities.createX(Resource).withId("abc");
        const r2 = entities.createX(Resource).withId("rst");

        const r1Again = entities.get(r1.globalId);

        expect(r1).toBe(r1Again);
    });

    it("creates, deletes and lists entities", async () => {
        const entities = me.openEntities("test");
        const r1 = entities.createX(Resource).withId("abc");
        const r2 = entities.createX(Resource).withId("rst");
        const r3 = entities.createX(Resource).withId("xyz");

        const sorter = (e1: Resource, e2: Resource) => e1.globalId.localeCompare(e2.globalId);

        const resources = entities.list(Resource).sort(sorter);

        expect(resources.length).toBe(3);

        expect(resources[0]).toBe(r1);
        expect(resources[1]).toBe(r2);
        expect(resources[2]).toBe(r3);

        entities.delete(r2);

        const resourcesAfterDelete = entities.list(Resource).sort(sorter);

        expect(resourcesAfterDelete.length).toBe(2);

        expect(resourcesAfterDelete[0]).toBe(r1);
        expect(resourcesAfterDelete[1]).toBe(r3);
    });
  });
