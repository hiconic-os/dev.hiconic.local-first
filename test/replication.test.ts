//import "../src/symbol-test"
import { describe, it, expect } from "vitest";
import { Resource } from "@dev.hiconic/gm_resource-model"
import * as mm from "@dev.hiconic/gm_manipulation-model"
import { reflection as refl, T } from "@dev.hiconic/tf.js_hc-js-api";
import * as me from "../src/managed-entities";

import { generateDataAndReplicate } from "./replication-helper"


describe("replication tests", () => {
  it("records entitiy creation", async () => {

    generateDataAndReplicate(

      entities => {
        const r1 = entities.create(Resource, { globalId: "abc"});
        const r2 = entities.create(Resource, { globalId: "xyz"})

        return [r1, r2];
      },

      (original, replicated, data, replicatedData) => {
      }
    );
  });
});