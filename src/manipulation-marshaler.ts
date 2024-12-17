import { reflection, lang, math, T, hc } from "@dev.hiconic/tf.js_hc-js-api";
import {
    Manipulation,
    CompoundManipulation,
    InstantiationManipulation,
    DeleteManipulation,
    PropertyManipulation,
    ChangeValueManipulation,
    AddManipulation,
    RemoveManipulation,
    ClearCollectionManipulation,
    ManifestationManipulation
} from "@dev.hiconic/gm_manipulation-model";
import * as vM from "@dev.hiconic/gm_value-descriptor-model";
import * as oM from "@dev.hiconic/gm_owner-model";
import * as rM from "@dev.hiconic/gm_root-model";
import { Continuation } from "./continuation.js"
import { map, set, list, float, double, integer, long, decimal, date } from "@dev.hiconic/hc-js-base";

import TypeCode = reflection.TypeCode

export class ManipulationMarshaller {

    async marshalToString(manipulations: Manipulation[], meta?: object): Promise<string> {
        const json = await this.marshalToJson(manipulations);
        const s = await new JsonStringifier().stringify(json);
        return s;
    }

    async marshalToJson(manipulations: Manipulation[]): Promise<any[]> {
        return await new ManipulationToJson().transform(manipulations);
    }

    async unmarshalFromString(s: string): Promise<Manipulation[]> {
        const json = JSON.parse(s);
        return await this.unmarshalFromJson(json);
    }

    async unmarshalFromJson(json: any): Promise<Manipulation[]> {
        return await new JsonToManipulation().transform(json);
    }
}

class JsonStringifier extends Continuation {
    async stringify(operations: any[]): Promise<string> {
        const buffer = new Array<string>();

        buffer.push("[");

        let first = true;

        this.forEachOf(operations, op => {
            const s = JSON.stringify(op);

            if (first) {
                first = false;
                buffer.push("\n ");
            }
            else {
                buffer.push(",\n ")
            }

            buffer.push(s);
        });

        await this.wait();

        if (!first)
            buffer.push("\n");

        buffer.push("]");

        return buffer.join("");
    }
}


class ManipulationToJson extends Continuation {

    private coalescing = new Array<any[]>();

    async transform(manipulations: Manipulation[]): Promise<any[]> {
        const json = new Array<any[]>();

        // transform the manipulations into json structures and collect coalescings
        this.manipulationsToJson(manipulations, json);

        await this.wait();

        this.coalesceAll();

        await this.wait();

        return json;
    }

    private coalesceAll(): void {
        this.forEachOf(this.coalescing, changes => this.coalesceChanges(changes));
    }

    private coalesceChanges(changes: any[]): void {
        let cvmOp: [string, object] | null = null;

        let args = new Array<any>();

        const opIt = new PropertyOperationsIterator(changes.splice(2)[Symbol.iterator]());

        for (const curOp of opIt) {
            const kind = curOp[0];
            const data = curOp[1];

            if (kind == "=") {
                if (cvmOp) {
                    Object.assign(cvmOp[1], data);
                }
                else {
                    cvmOp = curOp;
                    args.push(data);
                }
            }
            else {
                cvmOp = null;
                args.push(kind);
                args.push(data);
            }
        }

        changes.push(...args);
    }

    private manipulationToJson(m: Manipulation): any[] {
        switch (m.EntityType()) {
            case ChangeValueManipulation: return this.changeValueToJson(m as ChangeValueManipulation);
            case AddManipulation: return this.addToJson(m as AddManipulation);
            case RemoveManipulation: return this.removeToJson(m as RemoveManipulation);
            case InstantiationManipulation: return this.instantiationToJson(m as InstantiationManipulation);
            case ManifestationManipulation: return this.instantiationToJson(m as ManifestationManipulation);
            case CompoundManipulation: return this.compoundToJson(m as CompoundManipulation);
            case DeleteManipulation: return this.deleteToJson(m as DeleteManipulation);
            case ClearCollectionManipulation: return this.clearToJson(m as ClearCollectionManipulation);
        }

        throw new Error("unknown manipulation type " + m.EntityType().getTypeSignature());
    }

    private manipulationsToJson(manipulations: Iterable<Manipulation>, jsons: any[]): void {

        let latestChange: any[] | null;
        let multiChange: boolean = false;

        this.forEachOf(manipulations, m => {
            const json = this.manipulationToJson(m);
            const op = json[0];

            if (op == "@") {
                const id = json[1];
                if (latestChange && latestChange[1] == id) {

                    if (!multiChange) {
                        multiChange = true;
                        this.coalescing.push(latestChange);
                    }

                    latestChange.push(...json.slice(2));
                    return;
                }
                else {
                    latestChange = json;
                    multiChange = false;
                }
            }
            else {
                latestChange = null;
                multiChange = false;
            }

            jsons.push(json);
        });
    }

    private compoundToJson(m: CompoundManipulation): any[] {
        const json: any[] = ["*"];
        // TODO: shorten this if Iterable is supported
        const iterable = m.compoundManipulationList.values();

        this.manipulationsToJson(iterable, json);

        return json;
    }

    private instantiationToJson(m: InstantiationManipulation | ManifestationManipulation): InstantiationTuple {
        const e = m.entity;
        return [">", e.globalId, e.EntityType().getTypeSignature()];
    }

    private deleteToJson(m: DeleteManipulation): DeleteTuple {
        return ["<", m.entity.globalId];
    }

    private changeValueToJson(m: ChangeValueManipulation): ChangeValueTuple {
        const [id, property, type] = this.owner(m);
        return ["@", id, { [property]: this.valueToJson(type, m.newValue) }];
    }

    private addToJson(m: AddManipulation): ChangeValueTuple {
        return this.addOrRemoveToJson(m, m.itemsToAdd, "+");
    }

    private removeToJson(m: RemoveManipulation): ChangeValueTuple {
        return this.addOrRemoveToJson(m, m.itemsToRemove, "-");
    }

    private clearToJson(m: ClearCollectionManipulation): ChangeValueTuple {
        const [id, property] = this.owner(m);
        return ["@", id, "~", [property]];
    }

    private addOrRemoveToJson(m: PropertyManipulation, itemsToAddOrRemove: map<any, any>, op: string): ChangeValueTuple {
        const [id, property, type] = this.owner(m);

        let items: any;

        switch (type.getTypeCode()) {
            case TypeCode.objectType:
            case TypeCode.mapType:
                items = this.mapToJson(type as reflection.MapType, itemsToAddOrRemove);
                break;

            case TypeCode.listType:
                const listType = type as reflection.ListType;
                const listMapType = hc.getTypeReflection().getMapType(reflection.INTEGER, listType.getCollectionElementType());
                items = this.mapToJson(listMapType, itemsToAddOrRemove);
                break;

            case TypeCode.setType:
                const setType = type as reflection.SetType;
                // TODO: ask Peter about naming of our collections in general
                const set = new T.Set<any>();
                itemsToAddOrRemove.forEach(e => set.add(e));
                items = this.setToJson(setType, set);
                break;
        }

        return ["@", id, op, { [property]: items }];
    }

    private owner(m: PropertyManipulation): [id: string, property: string, type: reflection.GenericModelType] {
        const owner = m.owner as oM.LocalEntityProperty;
        const entity = owner.entity;
        const property = entity.EntityType().getProperty(owner.propertyName);
        return [entity.globalId, property.getName(), property.getType()];
    }

    private valueToJson(type: reflection.GenericModelType, value: any): any {
        if (value == null)
            return null;

        const expert = this.jsonExperts[type.getTypeCode().toString()];

        if (!expert)
            // TODO: reasoning
            throw new Error("unkown typecode " + type.getTypeCode());

        return expert(value, type);
    }

    private jsonExperts: Experts<(v: any, t: reflection.GenericModelType) => any> = {
        objectType: (v, t) => { return this.valueToJson(t.getActualType(v), v); },
        stringType(v: string): string { return v; },
        booleanType(v: boolean): boolean { return v; },
        floatType(v: float): FloatTuple { return ["f", v.valueOf()]; },
        doubleType(v: number): DoubleTuple { return ["d", v]; },
        decimalType(v: decimal): DecimalTuple { return ["D", v.toString()]; },
        integerType(v: integer): integer { return v; },
        longType(v: long): LongTuple { return ["l", v.toString()]; },
        // TODO: ask Peter about presentation of enum
        enumType(v: lang.Enum<any>, t): EnumTuple { return ["E", t.getTypeSignature(), v.toString()]; },
        entitType(v: rM.GenericEntity) { return ["E", (v as rM.GenericEntity).globalId]; },

        listType: (v: list<any>, t) => { return this.listToJson(t as reflection.ListType, v); },
        setType: (v: set<any>, t) => { return this.setToJson(t as reflection.SetType, v); },
        mapType: (v: map<any, any>, t): CollectionTuple => { return this.mapToJson(t as reflection.MapType, v); },

        dateType(v: date): DateTuple {
            return ["t",
                v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(),
                v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds(), v.getUTCMilliseconds()];
        },
    }

    mapToJson(t: reflection.MapType, v: map<any, any>): CollectionTuple {
        const keyType = t.getKeyType();
        const valueType = t.getValueType();
        const tuple: CollectionTuple = ["M"];

        this.forEachOf(v.entries(), e => {
            const keyJson = this.valueToJson(keyType, e[0]);
            const valueJson = this.valueToJson(valueType, e[1]);

            tuple.push(keyJson, valueJson);
        });

        return tuple;

    }

    setToJson(t: reflection.SetType, v: set<any>): CollectionTuple {
        // TODO: shorten this if Iterable is supported
        const iterable = v.values()
        return this.collectionToJson("S", t, iterable);
    }

    listToJson(t: reflection.ListType, v: list<any>): CollectionTuple {
        // TODO: shorten this if Iterable is supported
        const iterable = v.values()
        return this.collectionToJson("L", t, iterable);
    }

    collectionToJson(code: string, type: reflection.LinearCollectionType, collection: Iterable<any>): CollectionTuple {
        const elementType = type.getCollectionElementType();
        const tuple: CollectionTuple = [code];

        this.forEachOf(collection, element => {
            const json = this.valueToJson(elementType, element);
            tuple.push(json);
        });

        return tuple;
    }
}

interface Experts<F> {
    [key: string]: F;
}

type ValueWithType<V> = [value: V, type: reflection.GenericModelType]; 

class JsonToManipulation extends Continuation {
    private entities = new Map<string, rM.GenericEntity>();

    async transform(json: any): Promise<Manipulation[]> {
        const array: any[] = json;

        const manipulations = new Array<Manipulation>();
        const adder = manipulations.push.bind(manipulations);

        this.forEachOf(array, j => this.jsonToManipulations(j, adder));

        // wait for the continuation to end
        await this.wait();

        return manipulations;
    }

    private jsonToManipulations(json: any[], consumer: (m: Manipulation) => void) {
        const op = (json as ManipulationTuple)[0];

        this.manipulationExperts[op](json, consumer);
    }

    private jsonToValue(json: any): ValueWithType<any> {
        if (json == null) {
            return [null, reflection.OBJECT];
        }

        return this.valueExperts[typeof json](json);
    }

    private entity(id: string, typeSignature?: string): rM.GenericEntity {
        let e = this.entities.get(id);

        if (e)
            return e;

        const ref = vM.GlobalEntityReference.create();
        ref.refId = id;
        ref.typeSignature = typeSignature || rM.GenericEntity.getTypeSignature();

        this.entities.set(id, ref);

        return ref;
    }

    private entityProperty(entity: rM.GenericEntity, property: string): oM.LocalEntityProperty | oM.EntityProperty {
        const eP = oM.EntityProperty.create();
        eP.reference = entity as vM.EntityReference;
        eP.propertyName = property;
        return eP;
    }

    private manipulationExperts: Experts<(json: any[], consumer: (m: Manipulation) => void) => void> = {
        ["*"]: (json: any[], consumer: (m: CompoundManipulation) => void): void => {
            const m = CompoundManipulation.create();
            const manipulations = m.compoundManipulationList;
            const adder = manipulations.push.bind(manipulations);
            this.forEachOf(json, j => this.jsonToManipulations(j, adder));
            consumer(m);
        },

        [">"]: (json: any[], consumer: (m: InstantiationManipulation) => void): void => {
            const tuple = json as InstantiationTuple;
            const m = InstantiationManipulation.create();
            m.entity = this.entity(tuple[1], tuple[2]);
            consumer(m);
        },

        ["<"]: (json: any[], consumer: (m: DeleteManipulation) => void): void => {
            const tuple = json as DeleteTuple;
            const m = DeleteManipulation.create();
            m.entity = this.entity(tuple[1]);
            consumer(m);
        },

        ["@"]: (json: any[], consumer: (m: PropertyManipulation) => void): void => {
            const tuple = json as PropertyRelatedTuple;
            const id = tuple[1];
            const entity = this.entity(id);

            const it = tuple[Symbol.iterator]();

            // wind iterator two times to move the property manipulation elements
            it.next();
            it.next();

            const opIt = new PropertyOperationsIterator(it);

            this.forEachOfIterator(opIt, op => this.decodePropertyOperation(entity, op, consumer));
        }
    }

    private decodePropertyOperation(entity: rM.GenericEntity, opTuple: [string, object], consumer: (m: PropertyManipulation) => void): void {

        this.propertyExperts[opTuple[0]](entity, opTuple[1], consumer);
    }

    private mappify(value: any, type: reflection.GenericModelType): map<any, any> {
        switch (type.getTypeCode()) {
            case TypeCode.mapType: return value;
            case TypeCode.setType:
            case TypeCode.listType: {
                const c: Iterable<any> = value;
                const m = new T.Map<any, any>();
                for (const e of c)
                    m.set(e, e);
                return m;
            }
            default: {
                const m = new T.Map<any, any>();
                m.set(value, value);
                return m;
            }
        }
    }

    private propertyExperts: Experts<(e: rM.GenericEntity, o: object, consumer: (m: PropertyManipulation) => void) => void> = {

        ["="]: (e, o, consumer) => {
            this.forEachOf(Object.entries(o), entry => {
                const m = ChangeValueManipulation.create();
                m.owner = this.entityProperty(e, entry[0]);
                m.newValue = this.jsonToValue(entry[1])[0];
                consumer(m);
            });
        },

        ["+"]: (e, o, consumer) => {
            this.forEachOf(Object.entries(o), entry => {
                const m = AddManipulation.create();
                m.owner = this.entityProperty(e, entry[0]);

                const [items, type] = this.jsonToValue(entry[1]);

                this.runAfterPending(() => m.itemsToAdd = this.mappify(items, type!));

                consumer(m);
            });
        },

        ["-"]: (e, o, consumer) => {
            this.forEachOf(Object.entries(o), entry => {
                const m = RemoveManipulation.create();
                m.owner = this.entityProperty(e, entry[0]);

                const [items, type] = this.jsonToValue(entry[1]);
                this.runAfterPending(() => m.itemsToRemove = this.mappify(items, type!));
                
                consumer(m);
            });
        },

        ["~"]: (e, o, consumer) => {
            const properties = o as string[];

            this.forEachOf(properties, property => {
                const m = ClearCollectionManipulation.create();
                m.owner = this.entityProperty(e, property);
                consumer(m);
            });
        },
    }

    private valueExperts: Experts<(json: any) => ValueWithType<any>> = {
        string(json): ValueWithType<string> { return [json, reflection.STRING]; },
        boolean(json): ValueWithType<boolean> { return [json, reflection.BOOLEAN]; },
        number(json): ValueWithType<number> { return [json, reflection.INTEGER]; },
        object: (json): ValueWithType<any> => {
            const op: string = json[0];
            return this.exValueExperts[op](json);
        }
    }

    private exValueExperts: Experts<(json: any[]) => ValueWithType<any>> = {
        // base types: f = float, d = double, l = long,
        f(json): ValueWithType<float> { return [new T.Float((json as FloatTuple)[1]), reflection.FLOAT]; },
        d(json): ValueWithType<double> { return [new T.Double((json as DoubleTuple)[1]), reflection.DOUBLE]; },
        l(json): ValueWithType<long> { return [BigInt((json as LongTuple)[1]), reflection.LONG]; },
        D(json): ValueWithType<decimal> { return [math.bigDecimalFromString((json as DecimalTuple)[1]), reflection.DECIMAL]; },
        t(json): ValueWithType<date> { return [new Date(Date.UTC.apply(null, json.slice(1) as [number, number, number, number, number, number, number])), reflection.DATE]; },

        L: (json): ValueWithType<list<any>> => {
            T.Decimal

            const list = new T.Array<any>();
            const it = json[Symbol.iterator]();

            // eat up type-code so that only elements remain
            it.next();

            this.forEachOf(it, e => list.push(this.jsonToValue(e)[0]));

            return [list, reflection.LIST];
        },

        // decode Set
        S: (json): ValueWithType<set<any>> => {
            const set = new T.Set<any>();
            const it = json[Symbol.iterator]();

            // eat up type-code so that only elements remain
            it.next();

            this.forEachOfIterator(it, e => set.add(this.jsonToValue(e)[0]));

            return [set, reflection.SET];
        },

        // decode Map
        M: (json): ValueWithType<map<any, any>> => {
            const map = new T.Map<any, any>();
            const it = json[Symbol.iterator]();

            // eat up type-code so that only elements remain
            it.next();

            let key: any | undefined = undefined;

            this.forEachOfIterator(it, e => {
                if (key === undefined) {
                    [key] = this.jsonToValue(e);
                }
                else {
                    const [value] = this.jsonToValue(e);
                    map.set(key, value);
                    key = undefined;
                }
            });

            return [map, reflection.MAP];
        },

        E: (json): ValueWithType<rM.GenericEntity> => {
            const id = (json as EntityTuple)[1];
            const ref = vM.GlobalEntityReference.create();
            ref.refId = id;
            ref.typeSignature = rM.GenericEntity.getTypeSignature();
            return [ref, rM.GenericEntity];
        },

        e: (json): ValueWithType<lang.Enum<any>> => {
            const tuple = json as EnumTuple;
            const type = hc.getTypeReflection().getEnumTypeBySignature(tuple[1]);
            return [type.findConstant(tuple[2]), type];
        },
    }
}

class PropertyOperationsIterator implements Iterator<[string, object]>, Iterable<[string, object]> {
    private readonly it: Iterator<any>;

    constructor(it: Iterator<any>) {
        this.it = it;
    }

    [Symbol.iterator]() {
        return this;
    }

    next(): IteratorResult<[string, object]> {
        const r = this.it.next();

        if (r.done)
            return { done: true, value: undefined };

        const candidate = r.value;

        if (typeof candidate == 'string') {
            const operandR = this.it.next();

            if (operandR.done)
                // TODO: property reasoning with reason entities
                throw "Unexpected End of array";


            return { done: false, value: [candidate, operandR.value] };
        }
        else {
            return { done: false, value: ["=", candidate] };
        }
    }
}

type ManipulationTuple = [man: string, ...args: any];
type InstantiationTuple = [man: string, id: string, type: string];
type DeleteTuple = [man: string, id: string];
// type CompoundTuple = [man: string, ...manipulations: ManipulationTuple];
type ChangeValueTuple = [man: string, id: string, ...changes: any];
type PropertyRelatedTuple = [man: string, id: string, ...changes: object[]];

type EntityTuple = [type: string, id: string];
type EnumTuple = [type: string, type: string, constant: string];
type DoubleTuple = [type: string, type: number];
type FloatTuple = [type: string, type: number];
type LongTuple = [type: string, type: string];
type DecimalTuple = [type: string, type: string];
type DateTuple = [type: string, year: number, month: number, day: number, hours: number, minutes: number, seconds: number, milliseconds: number];

type CollectionTuple = [type: string, ...elements: any];