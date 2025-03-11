import { Reason } from "@dev.hiconic/gm_reason-model";
import { T, hc } from "@dev.hiconic/tf.js_hc-js-api";
import { describe, expect, it } from "vitest";
import { JsonMarshaller } from "../src/json/json-marshaller.js";
import { cloneEntity, Cloning } from "../src/cloning.js";

describe("cloning", () => {

  it("cloning", async () => {
    const r1 = Reason.create();
    const r2 = Reason.create();
    const r3 = Reason.create();

    r1.text = "one";
    r2.text = "two";
    r3.text = "three";

    r1.reasons.push(r2);
    r1.reasons.push(r3);
    r2.reasons.push(r1);
    r3.reasons.push(r1);

    const cr1 = cloneEntity(r1);
    const cr2 = cr1.reasons.at(0)!;
    const cr3 = cr1.reasons.at(1)!;
    const cr1By2 = cr2.reasons.at(0)!
    const cr1By3 = cr3.reasons.at(0)!;

    expect(cr1.text).toBe("one");
    expect(cr2.text).toBe("two");
    expect(cr3.text).toBe("three");
    
    expect(cr1).toBe(cr1By2);
    expect(cr1).toBe(cr1By3);
  });
});
