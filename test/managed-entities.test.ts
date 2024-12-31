import { describe, it, expect } from "vitest";
import { Resource } from "@dev.hiconic/gm_resource-model"
import { ChangeValueManipulation, CompoundManipulation, InstantiationManipulation } from "@dev.hiconic/gm_manipulation-model"
import { LocalEntityProperty } from "@dev.hiconic/gm_owner-model"
import * as mm from "@dev.hiconic/gm_manipulation-model"
import { reflection as refl, T, hc } from "@dev.hiconic/tf.js_hc-js-api";
import * as me from "../src/managed-entities";

function outputManipulations(manipulations: mm.Manipulation[]) {
    for (const manipulation of manipulations) {
        console.log(manipulation.EntityType().getTypeSignature())
    }
}

function createTestDbName(name: string): string {
    return name + "-" + hc.util.newUuid();
}

describe("managed entities", () => {
    it("creates entities and accesses an entity by globalId", async () => {
        const entities = me.openEntities("test");

        const r1 = entities.createX(Resource).withId("abc");
        const r2 = entities.createX(Resource).withId("rst");

        const r1Again = entities.get(r1.globalId!);

        expect(r1).toBe(r1Again);
    });

    it("creates, deletes and lists entities", async () => {
        const entities = me.openEntities("test");
        const r1 = entities.createX(Resource).withId("abc");
        const r2 = entities.createX(Resource).withId("rst");
        const r3 = entities.createX(Resource).withId("xyz");

        const sorter = (e1: Resource, e2: Resource) => e1.globalId!.localeCompare(e2.globalId!);

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

    it("extends an instantiation manipulation to compound", async () => {
        const entities = me.openEntities("test");

        entities.session.listeners().add({
            onMan(manipulation) {
                if (InstantiationManipulation.isInstance(manipulation)) {
                    const im = manipulation as InstantiationManipulation;
                    if (Resource.isInstance(im.entity)) {
                        entities.manipulationBuffer.extendingCompoundManipulation(manipulation, () => {
                            const resource = im.entity as Resource;
                            resource.mimeType = "text/plain";
                        })
                    }
                }
            },
        })

        const resource = entities.create(Resource);

        const manis = entities.manipulationBuffer.getCommitManipulations();

        expect(resource.mimeType).toBe("text/plain");
        expect(manis.length).toBe(1);
        expect(CompoundManipulation.isInstance(manis[0])).toBeTruthy();

        const cm = manis[0] as CompoundManipulation;

        for (const m of cm.compoundManipulationList) {
            console.log(m.ToString());
        }

        const cManis = cm.compoundManipulationList;

        expect(cManis.length).toBe(2);
        expect(InstantiationManipulation.isInstance(cManis.at(0)!)).toBeTruthy();
    });

    it("extends a change value manipulation to compound and blocks that for undoing", async () => {
        const entities = me.openEntities("test");

        entities.session.listeners().add({
            onMan(manipulation) {
                if (!entities.manipulationBuffer.isUndoing() && ChangeValueManipulation.isInstance(manipulation)) {
                    const cvm = manipulation as ChangeValueManipulation;
                    const ep = cvm.owner as LocalEntityProperty;
                    if (Resource.isInstance(ep.entity) && ep.propertyName == "name") {
                        entities.manipulationBuffer.extendingCompoundManipulation(manipulation, () => {
                            const resource = ep.entity as Resource;
                            resource.mimeType = "text/plain";
                        })
                    }
                }
            },
        })

        const resource = entities.create(Resource);
        resource.name = "unnamed";

        const manis = entities.manipulationBuffer.getCommitManipulations();

        expect(resource.mimeType).toBe("text/plain");
        expect(manis.length).toBe(2);
        expect(InstantiationManipulation.isInstance(manis[0])).toBeTruthy();
        expect(CompoundManipulation.isInstance(manis[1])).toBeTruthy();

        const cm = manis[1] as CompoundManipulation;

        const cManis = cm.compoundManipulationList;

        expect(cManis.length).toBe(2);
        expect(ChangeValueManipulation.isInstance(cManis.at(0))).toBeTruthy();
        expect(ChangeValueManipulation.isInstance(cManis.at(1))).toBeTruthy();

        entities.manipulationBuffer.undo();

        const manisAfterUndo = entities.manipulationBuffer.getCommitManipulations();

        expect(resource.mimeType).not.toBe("text/plain");
        expect(manisAfterUndo.length).toBe(1);
        expect(InstantiationManipulation.isInstance(manisAfterUndo[0])).toBeTruthy();
    });

    it("commit state check", async () => {
        const entities = me.openEntities("test");
        entities.create(Resource);

        await entities.commit()
    });

    it("data initialization", async () => {

        const rid = "the-resource";
        const name = "foobar";

        const initializer: me.DataInitializer = async ents => {
            const r = ents.createX(Resource).withId(rid);
            r.name = name;
        };

        const entities = me.openEntities("test", {dataInitializers: [initializer]});
        await entities.load();

        const r = entities.get(rid) as Resource;

        expect(r.name).toBe(name);
    });
  });
