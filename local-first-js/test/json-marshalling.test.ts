import { Resource } from "@dev.hiconic/gm_resource-model";
import { TransientSource } from "@dev.hiconic/gm_transient-resource-model";
import { describe, expect, it } from "vitest";
import { JsonMarshaller } from "../src/json/json-marshaller.js";
import { TypeExplicitness } from "../src/json/json-writer.js";
import { readFileSync } from 'fs';
import { join } from 'path';

describe("json marshalling", () => {

  it("first", async () => {
    const resource = Resource.create();
    resource.name = "one";
    resource.mimeType = "text/plain";
    resource.tags.add("one");
    resource.tags.add("two");

    const source = TransientSource.create();
    source.globalId = "foobar";

    resource.resourceSource = source;

    const marshaller = new JsonMarshaller();
    const json = await marshaller.marshallToString(resource, { inferredRootType: Resource, typeExplicitness: TypeExplicitness.polymorphic});

    
    // Create a URL for the expected file relative to the current module.
    const path = join(__dirname, "/json/explicitness-polymorphic.json");
    const expectedContent = readFileSync(path, 'utf8');

    expect(json).toBe(expectedContent);
  });

});
