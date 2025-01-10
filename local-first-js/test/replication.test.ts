//import "../src/symbol-test"
import { describe, it, expect } from "vitest";
import { Resource } from "@dev.hiconic/gm_resource-model"
import { TransientSource } from "@dev.hiconic/gm_transient-resource-model"
import { generateReplication } from "./replication-helper.js"

describe("replication tests", () => {
  it("stores and loads a transaction in indexedDB", async () => {

    const globalId = "abc";
    const now = new Date();
    let resource: Resource;

    await generateReplication()

      .addTransaction(entities => {
        resource = entities.createX(Resource).withId(globalId);
        resource.name = "Test Resource";
        resource.mimeType = "text/plain";

        return { name: "person1", address: "p3r50n1" }
      })

      .addTransaction(entities => {
        const source = entities.create(TransientSource);
        source.useCase = "foobar";
        resource.tags.add("one");
        resource.tags.add("two");
        resource.created = now;
        resource.resourceSource = source;

        return { name: "person2", address: "p3r50n2" }
      })
      
      .replicate((_original, replicated) => {
        const replicatedResource = replicated.get(Resource, globalId);

        expect(replicatedResource.name).toBe(resource.name);
        expect(replicatedResource.mimeType).toBe(resource.mimeType);
        expect(replicatedResource.tags.has("one")).toBeTruthy();
        expect(replicatedResource.tags.has("two")).toBeTruthy();
        expect(replicatedResource.created).toStrictEqual(now);
        expect(replicatedResource.resourceSource?.useCase).toBe("foobar");
      });
  });
  it("replicating compound manipulation", async () => {
    const globalId = "abc";
    let resource: Resource;
    const now = new Date();

    await generateReplication().addTransaction(entities => {
      entities.openNestedFrame().run(() => {
        entities.openNestedFrame().run(() => {
          entities.openNestedFrame().run(() => {
            resource = entities.createX(Resource).withId(globalId);
            resource.name = "Test Resource";
            resource.mimeType = "text/plain";
          });
          entities.openNestedFrame().run(() => {
            resource.created = now;
          });
        });
        resource.creator = "God";
      })

      return { name: "person1", address: "p3r50n1" }
    })
    .replicate((_original, replicated) => {
      const replicatedResource = replicated.get(Resource, globalId);

      expect(replicatedResource.name).toBe(resource.name);
      expect(replicatedResource.mimeType).toBe(resource.mimeType);
      expect(replicatedResource.created).toStrictEqual(now);
      expect(replicatedResource.creator).toBe("God");
    });
  });
  it("replicating compound manipulation2", async () => {
    const globalId = "abc";
    let resource: Resource;
    const now = new Date();

    await generateReplication().addTransaction(entities => {
      entities.openNestedFrame().run(() => {
        resource = entities.createX(Resource).withId(globalId);
        resource.name = "Test Resource";
        resource.mimeType = "text/plain";
      });
      entities.openNestedFrame().run(() => {
        resource.creator = "God";
        resource.created = now;
      });

      return { name: "person1", address: "p3r50n1" }
    })
    .replicate((_original, replicated) => {
      const replicatedResource = replicated.get(Resource, globalId);

      expect(replicatedResource.name).toBe(resource.name);
      expect(replicatedResource.mimeType).toBe(resource.mimeType);
      expect(replicatedResource.created).toStrictEqual(now);
    });
  });
});