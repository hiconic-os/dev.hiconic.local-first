import { Resource } from "@dev.hiconic/gm_resource-model";
import { PushRequest } from "@dev.hiconic/gm_service-api-model";
import { T, hc, reflection } from "@dev.hiconic/tf.js_hc-js-api";
import { describe, expect, it } from "vitest";
import { JsonMarshaller } from "../src/json/json-marshaller.js";
import { TypeExplicitness } from "../src/json/json-writer.js";

describe("json unmarshalling", () => {

  it("request meta data serialization roundtrip", async () => {
    const request = PushRequest.create();
    const resource = Resource.create();
    const marshaller = new JsonMarshaller();
    const json = await marshaller.marshallToString(request, { typeExplicitness: TypeExplicitness.polymorphic });
    const json2 = await marshaller.marshallToString(resource, { typeExplicitness: TypeExplicitness.polymorphic });
    await marshaller.unmarshall(json);

    console.log(json2);
  });

  it("syntax error", async () => {
    const json = "{{}}";
    
    const marshaller = new JsonMarshaller();

    try {
      await marshaller.unmarshall(json);
    }
    catch (e) {
      // TODO: check reasoning here
    }


  });

  it("map of primitives", async () => {

    const date = new Date(Date.UTC(2022, 0, 1, 0, 0, 0, 0));

    const json = JSON.stringify({
        booleanValue1: true,
        booleanValue2: false,
        stringValue: "Hello World!",
        integerValue: 5,
        longValue1: { _type: "long", value: 5 },
        longValue2: { _type: "long", value: "23" },
        floatValue: { _type: "float", value: 5 },
        doubleValue: { _type: "double", value: 5 },
        decimalValue1: { _type: "decimal", value: 5 },
        decimalValue2: { _type: "decimal", value: "23" },
        dateValue: { _type: "date", value: "2022-01-01T00:00:00.000Z" }
    });

    const marshaller = new JsonMarshaller();
    const map: T.Map<string, hc.CollectionElement> = (await marshaller.unmarshall(json))!;

    expect(map.get("booleanValue1")).toBe(true);
    expect(map.get("booleanValue2")).toBe(false);
    expect(map.get("stringValue")).toBe("Hello World!");
    expect(map.get("integerValue")).toBe(5);
    expect(map.get("longValue1")).toBe(BigInt(5));
    expect(map.get("longValue2")).toBe(BigInt(23));
    expect(map.get("floatValue")).toStrictEqual(new T.Float(5));
    expect(map.get("doubleValue")).toStrictEqual(new T.Double(5));
    expect(map.get("decimalValue1")).toStrictEqual(T.Decimal.valueOfDouble(5));
    expect(map.get("decimalValue2")).toStrictEqual(T.Decimal.valueOfDouble(23));
    expect(map.get("dateValue")).toStrictEqual(date);
  });

  it("inferred map of primitives", async () => {
    const json = JSON.stringify({
        stringValue: "Hello World!",
        integerValue: 5,
    });

    const marshaller = new JsonMarshaller();
    const stringToObjectMapType = reflection.typeReflection().getMapType(reflection.STRING, reflection.OBJECT);
    const map: T.Map<string, hc.CollectionElement> = (await marshaller.unmarshall(json, { inferredRootType: stringToObjectMapType }))!;

    expect(map.get("stringValue")).toBe("Hello World!");
    expect(map.get("integerValue")).toBe(5);
  });

  it("inferred entity", async () => {
    const date = new Date(Date.UTC(2022, 0, 1, 0, 0, 0, 0));

    const json = JSON.stringify({
        name: "test",
        created: date,
        mimeType: "text/plain",
        tags: [
            "one",
            "two",
            "three"
        ]
    });

    const marshaller = new JsonMarshaller();
    const resource: Resource = (await marshaller.unmarshall(json, { inferredRootType: Resource }))!;

    expect(resource.name).toBe("test");
    expect(resource.mimeType).toBe("text/plain");
    expect(resource.created).toStrictEqual(date);
    expect([...resource.tags]).toStrictEqual(["one", "two", "three"]);
  });

  it("explicit entity", async () => {
    const date = new Date(Date.UTC(2022, 0, 1, 0, 0, 0, 0));

    const json = JSON.stringify({
        _type: Resource.getTypeSignature(),
        name: "test",
        created: date,
        mimeType: "text/plain",
        tags: [
            "one",
            "two",
            "three"
        ]
    });

    const marshaller = new JsonMarshaller();
    const resource: Resource = (await marshaller.unmarshall(json))!;

    expect(resource.name).toBe("test");
    expect(resource.mimeType).toBe("text/plain");
    expect(resource.created).toStrictEqual(date);
    expect([...resource.tags]).toStrictEqual(["one", "two", "three"]);
  });
  
  it("explicit entity", async () => {
    const date = new Date(Date.UTC(2022, 0, 1, 0, 0, 0, 0));

    const json = JSON.stringify({
        _type: Resource.getTypeSignature(),
        name: "test",
        created: date,
        mimeType: "text/plain",
        tags: [
            "one",
            "two",
            "three"
        ]
    });

    const marshaller = new JsonMarshaller();
    const resource: Resource = (await marshaller.unmarshall(json))!;

    expect(resource.name).toBe("test");
    expect(resource.mimeType).toBe("text/plain");
    expect(resource.created).toStrictEqual(date);
    expect([...resource.tags]).toStrictEqual(["one", "two", "three"]);
  });
});
