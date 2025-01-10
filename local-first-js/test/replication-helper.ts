import * as me from "../src/managed-entities.js";
import { MockManagedEntityAuth, ManagedEntityEncryption } from "../src/crypto.js"
import { GenericEntity } from "@dev.hiconic/gm_root-model"
import { util } from "@dev.hiconic/tf.js_hc-js-api"

export type GmData<T extends GenericEntity> = T | T[] | undefined
export type DataGenerator = (entities: me.ManagedEntities) => me.Signer;
export type DataTester = (original: me.ManagedEntities, replicated: me.ManagedEntities) => void;

export interface ReplicationTestBuilder {
    addTransaction(generator: DataGenerator): ReplicationTestBuilder;
    replicate(tester: DataTester): Promise<void>
}

const auth = new MockManagedEntityAuth();
const encryption = new ManagedEntityEncryption("replication-test", async () => "pwd");

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