import * as me from "../src/managed-entities";
import { MockManagedEntityAuth, MockManagedEntityEncryption } from "../src/crypto"
import { GenericEntity } from "@dev.hiconic/gm_root-model"
import { util } from "@dev.hiconic/tf.js_hc-js-api"
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

function createTestDbName(name: string): string {
    return name + "-" + util.newUuid();
}

export function generateReplication(): ReplicationTestBuilder {
    const generators: DataGenerator[] = [];

    return {
        addTransaction(generator) {
            generators.push(generator);
            return this;
        },
        async replicate(tester) {
            const dbName = createTestDbName("test");
            const original = me.openEntities(dbName, {auth, encryption});

            for (const generator of generators) {
                const signer = generator(original);
                await original.commit(signer);
            }

            const replicated = me.openEntities(dbName, {auth, encryption});
            
            await replicated.load();
        
            tester(original, replicated);

            return;
        },
    }
}