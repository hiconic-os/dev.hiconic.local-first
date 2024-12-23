import * as me from "../src/managed-entities";
import { MockManagedEntityAuth, MockManagedEntityEncryption } from "../src/crypto"
import { GenericEntity } from "@dev.hiconic/gm_root-model"
import { ManipulationMarshaller } from "../src/manipulation-marshaler";

export type GmData<T extends GenericEntity> = T | T[] | undefined
export type DataGenerator = (entities: me.ManagedEntities) => me.Signer;
export type DataTester = (original: me.ManagedEntities, replicated: me.ManagedEntities) => void;

export interface ReplicationTestBuilder {
    addTransaction(generator: DataGenerator): ReplicationTestBuilder;
    replicate(tester: DataTester): Promise<void>
}

const auth = new MockManagedEntityAuth();
const encryption = new MockManagedEntityEncryption();

export function generateReplication(): ReplicationTestBuilder {
    const generators: DataGenerator[] = [];

    return {
        addTransaction(generator) {
            generators.push(generator);
            return this;
        },
        async replicate(tester) {
            const original = me.openEntities("test", {auth, encryption});

            for (const generator of generators) {
                const signer = generator(original);
                await original.commit(signer);
            }

            const replicated = me.openEntities("test", {auth, encryption});
            
            await replicated.load();
        
            tester(original, replicated);

            return;
        },
    }
}