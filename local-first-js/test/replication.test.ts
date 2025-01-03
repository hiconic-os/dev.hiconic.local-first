//import "../src/symbol-test"
import { describe, it, expect } from "vitest";
import { Resource } from "@dev.hiconic/gm_resource-model"
import * as mm from "@dev.hiconic/gm_manipulation-model"
import { reflection as refl, T } from "@dev.hiconic/tf.js_hc-js-api";
import * as me from "../src/managed-entities";

import { generateReplication } from "./replication-helper"


describe("replication tests", () => {
  it("stores and loads a transaction in indexedDB", async () => {

    const globalId = "abc";
    let resource: Resource;

    await generateReplication()

      .addTransaction(entities => {
        resource = entities.createX(Resource).withId(globalId);
        resource.name = "Test Resource";
        resource.mimeType = "text/plain";

        return { name: "person1", address: "p3r50n1" }
      })

      .addTransaction(entities => {
        resource.tags.add("one");
        resource.tags.add("two");

        return { name: "person2", address: "p3r50n2" }
      })
      
      .replicate((original, replicated) => {
        const replicatedResource: Resource = replicated.get(globalId);

        expect(replicatedResource.name).toBe(resource.name);
        expect(replicatedResource.mimeType).toBe(resource.mimeType);
        expect(replicatedResource.tags.has("one")).toBeTruthy();
        expect(replicatedResource.tags.has("two")).toBeTruthy();
      });
  });
  it("replicating compound manipulation", async () => {
    const globalId = "abc";
    let resource: Resource;

    await generateReplication().addTransaction(entities => {
      entities.openNestedFrame().run(() => {
        resource = entities.createX(Resource).withId(globalId);
        resource.name = "Test Resource";
        resource.mimeType = "text/plain";
      })

      return { name: "person1", address: "p3r50n1" }
    })
    .replicate((original, replicated) => {
      const replicatedResource: Resource = replicated.get(globalId);

      expect(replicatedResource.name).toBe(resource.name);
      expect(replicatedResource.mimeType).toBe(resource.mimeType);
    });
  });
});