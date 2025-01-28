//import "../src/symbol-test"
import { describe, expect, it } from "vitest";
import { openEntities } from "../src/managed-entities.js";
import { Resource } from "@dev.hiconic/gm_resource-model";

describe("draft tests", () => {
  it("draft vanishing by commit", async () => {
    const entities = openEntities("test", { manageDraft: true });

    const resource = entities.create(Resource);

    resource.name = "resource";

    await entities.commit()

    const replicatedEntities = openEntities("test", { manageDraft: true });

    await replicatedEntities.load();

    const replicatedResource = replicatedEntities.get(Resource, resource.globalId!);

    expect(replicatedResource.name).toBe(resource.name);
  });

  it("draft", async () => {

    // ### Entering Data
    const entities = openEntities("test", { manageDraft: true });

    const resource = entities.create(Resource);

    resource.name = "resource";

    // ## Saving data
    await entities.commit();

    // ### Entering draft data
    resource.mimeType = "text/plain";
    resource.tags.add("marked");

    // ## Waiting for draft data to be saved
    entities.getDraft()?.waitForEmptyQueue();

    // ### Loading data which should have the saved and the draft data inside
    const replicatedEntities = openEntities("test", { manageDraft: true });
    await replicatedEntities.load();

    const replicatedResource = replicatedEntities.get(Resource, resource.globalId!);

    expect(replicatedResource.name).toBe(resource.name);
    expect(replicatedResource.mimeType).toBe(resource.mimeType);
    expect(replicatedResource.tags.size).toBe(1);
    expect(replicatedResource.tags.values().next().value).toBe(resource.tags.values().next().value);
  });
});