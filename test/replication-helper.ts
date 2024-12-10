import * as me from "../src/managed-entities";
import { GenericEntity } from "@dev.hiconic/gm_root-model"
import { ManipulationMarshaller } from "../src/manipulation-marshaler";

export type GmData<T extends GenericEntity> = T | T[] | undefined
export type DataGenerator<E extends GenericEntity, D extends GmData<E>> = (entities: me.ManagedEntities) => D;
export type DataTester<E extends GenericEntity, D extends GmData<E>> = (original: me.ManagedEntities, replicated: me.ManagedEntities, data: D, replicatedData: D) => void;

export async function generateDataAndReplicate<E extends GenericEntity, D extends GmData<E>>(generator: DataGenerator<E, D>, tester: DataTester<E, D>): Promise<void> {
    const original = me.openEntities("test");
    const data = generator(original);

    const manipulations = original.manipulationBuffer.getCommitManipulations();
    const marshaler = new ManipulationMarshaller();
    const jsonAsStr = await marshaler.marshalToString(manipulations);
    const replicatedManipulations = await marshaler.unmarshalFromString(jsonAsStr)

    const replicated = me.openEntities("test");

    let replicatedData: D;

    if (data) {
        if (Array.isArray(data)) {
            const entityArray = data as E[];

            replicatedData = undefined as D;
        }
        else {
            const entity = data as E;

            const replicatedEntity = replicated.get(entity.globalId);
            replicatedData = replicatedEntity as D;
        }
    }
    else {
        replicatedData = undefined as D;
    }

    tester(original, replicated, data, replicatedData);
}
