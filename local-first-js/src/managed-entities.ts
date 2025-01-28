import * as mM from "@dev.hiconic/gm_manipulation-model";
import * as rM from "@dev.hiconic/gm_root-model";
import { reflection, session, util } from "@dev.hiconic/tf.js_hc-js-api";
import { hashSha256 } from "./crypto.js";
import { ManipulationBuffer, ManipulationBufferEvent, ManipulationBufferUpdateListener, ManipulationFrame, SessionManipulationBuffer } from "./manipulation-buffer.js";
import { ManipulationMarshaller } from "./manipulation-marshaler.js";
import { AccessiblePromise } from "./async.js";


export type { ManipulationBuffer, ManipulationBufferUpdateListener };

export const ERROR_DECRYPTION_KEY = {
    message: "Key was wrong"
} as const;

export const ERROR_WRONG_SIGNATURE = {
    message: "Signature was wrong"
} as const;

export const ERROR_SIGNING_WITHDRAWN = {
    message: "Signing was withdrawn"
} as const;

export type ManagedEntitiesConfig = {
    auth?: ManagedEntitiesAuth, 
    encryption?: ManagedEntitiesEncryption,
    dataInitializers?: DataInitializer[],
    manageDraft?: boolean
}

/** 
 * Opens a {@link ManagedEntities} instance backed by the indexedDB named "event-source-db".
 * @param databaseName name of the ObjectStore used as space for the stored events
 */
export function openEntities(databaseName: string, security?: ManagedEntitiesConfig): ManagedEntities {
    return new ManagedEntitiesImpl(databaseName, security)
}

/** Restricts string literals to the existing properties of a type excluding globalID */
export type PartialProperties<T> = Partial<
  Pick<T, { [K in keyof T]: T[K] extends Function ? never : K extends "globalId" ? never : K }[keyof T]>
>;

/**
 * Optional security for managed entities
 */
export interface ManagedEntitiesAuth {
    /**
     * Asynchronously signs a data (most likely involving some UI interaction for the user)
     * @param data the data to be signed
     */
    sign(data: string, signerAddress: string): Promise<string>;

    /**
     * Verifies the signature for a data
     * @param data the hash the signature was allegedly made for
     * @param signature the signature for the hash to be verified
     */
    verify(data: string, signature: string, signerAddress: string): Promise<boolean>;

    /**
     * Creates a hash for arbitrary string content. The hash could be used for signing.
     * @param data the data to be hashed
     */
    hash(data: string): Promise<string>;

    getSigningContextName(): string;
}

export interface ManagedEntitiesEncryption {
    /**
     * Asynchronously encrypts data which maybe involve interaction with a wallet or entering a passphrase
     * @param data the data to be encrypted
     */
    encrypt(data: string): Promise<string>;

    /**
     * Asynchronously decrypts data which maybe involve interaction with a wallet or entering a passphrase
     * @param data the data to be encrypted
     */
    decrypt(data: string): Promise<string>;

}

export type DataInitializer = (entities: ManagedEntities) => Promise<void>

/**
 * 
 */
export interface EntityCreationBuilder<E extends rM.GenericEntity> {
    /** The entity will be created without initializers being applied */
    raw(): EntityCreationBuilder<E>;

    /** Creates the entity with an explicit globalId */
    withId(globalId: string): E

    /** Creates the entity with a randomly generated UUID as globalId */
    withRandomId(): E;
}

export interface Signer {
    name?: string;
    address: string;
}

export interface TransactionMeta {
    version: number;
    deps: string[];
    id: string;
    date: number;
}

/**
 * Describes a transaction that is modelled in a way that it can be stored as JSON-like structure in the {@link indexedDB}
 */
export interface Transaction extends TransactionMeta {
    signer?: Signer;
    hash: string;
    signature?: string;
    payload: string | Blob;
}

interface TransactionPayload extends TransactionMeta {
    diff: [];
}


/**
 * Manages entities given by instances {@link rM.GenericEntity GenericEntity} within an in-memory OODB and 
 * stores changes in a event-sourcing persistence (e.g. indexedDB, Supabase, SQL blobs).
 * 
 * The initial state of all entities is built from the change history loaded from the event-source persistence. Once the state is established
 * changes on entities are recorded as instances of {@link mM.Manipulation Manipulation}. 
 * 
 * Changes can be committed which is done by the appendage of a new transaction entry containing the recorded {@link mM.Manipulation manipulations}
 * in a serialized form.
 */
export interface ManagedEntities {
    /**
     * An buffer of manipulations that will collect {@link mM.Manipulation manipulations} recorded by the {@link ManagedEntitiesImpl.session session}
     * for later committing
     */
    manipulationBuffer: ManipulationBuffer;

    encryption?: ManagedEntitiesEncryption;

    /**
     * Creates a {@link ManagedEntities.session|session}-associated {@link rM.GenericEntity entity} with a globalId initialized to a random UUID.
     * The default initializers of the entity will be applied.
     * The instantiation will be recorded as {@link mM.InstantiationManipulation InstantiationManipulation}
     * @param type the {@link reflection.EntityType entity type} of the entity to be created
     */
    create<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): E;

    /**
     * Creates a {@link ManagedEntities.session|session}-associated {@link rM.GenericEntity entity} with a globalId initialized to a random UUID.
     * The default initializers of the entity will not be applied.
     * The instantiation will be recorded as {@link mM.InstantiationManipulation InstantiationManipulation}
     * @param type the {@link reflection.EntityType entity type} of the entity to be created
     */
    createRaw<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): E;

    createX<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): EntityCreationBuilder<E>;

    /**
     * Deletes an {@link rM.GenericEntity entity} from the {@link ManagedEntities.session|session}.
     * The deletion will be recorded as {@link mM.DeleteManipulation DeleteManipulation}
     * @param entity the {@link rM.GenericEntity entity} to be deleted
     */
    delete(entity: rM.GenericEntity): void;

    /**
     * Retrieves the {@link rM.GenericEntity entity} with the given globalId.
     * @param type the type 
     * @param globalId the globalId of the entity
     */
    get<E extends rM.GenericEntity>(type: reflection.EntityType<E>, globalId: string): E;

    list<E extends rM.GenericEntity>(type: reflection.EntityType<E>): E[];

    openNestedFrame(extendOn?: mM.Manipulation): ManipulationFrame;

    /**
     * Establishes a state within the {@link ManagedEntities.session|session} by applying the given manipulations.
     */
    apply(manipulations: mM.Manipulation[]): Promise<void>

    /**
     * Establishes a state within the {@link ManagedEntities.session|session} by loading and applying changes from the event-source persistence.
     */
    load(): Promise<void>;

    /**
     * Links the signed transactions into the transaction dependency tree and persists them.
     */
    merge(transactions: Transaction[]): Promise<void>;

    /**
     * Persists the recorded and collected {@link mM.Manipulation manipulations} by appending them as a transaction to the event-source persistence.
     */
    commit(signer?: Signer, withdrawn?: () => boolean): Promise<void>;

    /**
     * Builds a select query from a GMQL select query statement which can then be equipped with variable values and executed.
     * @param statement a GMQL select query statement which may contain variables
     */
    selectQuery(statement: string): Promise<session.SelectQueryResultConvenience>;

    /**
     * Builds an entity query from a GMQL entity query statement which can then be equipped with variable values and executed.
     * @param statement a GMQL entity query statement which may contain variables
     */
    entityQuery(statement: string): Promise<session.EntityQueryResultConvenience>;

    getDraft(): Draft | undefined;

    /**
     * The in-memory OODB that keeps all the managed {@link rM.GenericEntity entities}, records changes on them as {@link mM.Manipulation manipulations} 
     * and makes the entities and their properties accessible by queries.
     */
    session: session.ManagedGmSession;
}

/**
 * Implementation of {@link ManagedEntities} that uses {@link indexedDB} as event-source persistence.
 */
class ManagedEntitiesImpl implements ManagedEntities {
    readonly session = new session.BasicManagedGmSession()

    readonly manipulationBuffer: SessionManipulationBuffer;

    /**
     * The actual transaction backend based on {@link indexedDB}
     */
    databasePromise?: Promise<Database>

    /** The id of the last transaction (e.g. from load or commit) for later linkage to a next transaction */
    lastTransactionId?: string

    /** The name of the ObjectStore used to fetch and append transaction */
    databaseName: string

    /** The optional signature service that ensures authenticity of transactions */
    security?: ManagedEntitiesAuth;

    encryption?: ManagedEntitiesEncryption;

    initializers?: DataInitializer[];

    draft?: DraftImpl;

    constructor(databaseName: string, config?: ManagedEntitiesConfig) {
        this.databaseName = databaseName
        this.manipulationBuffer = new SessionManipulationBuffer(this.session);
        this.security = config?.auth;
        this.encryption = config?.encryption;
        this.initializers = config?.dataInitializers;
        
        if(config?.manageDraft)
            this.draft = new DraftImpl(() => this.getDatabase(), this.manipulationBuffer, this.session, this.encryption);
    }

    create<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): E {
        return this.initAndAttach(type, false, properties);
    }

    createRaw<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): E {
        return this.initAndAttach(type, true, properties);
    }

    createX<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): EntityCreationBuilder<E> {
        let raw = false;
        return {
            raw() {
                raw = true;
                return this;
            },
            withId: (globalId) => {
                return this.initAndAttach(type, raw, properties, globalId);
            },
            withRandomId: () => {
                return this.initAndAttach(type, raw, properties);
            }
        }
    }

    private initAndAttach<E extends rM.GenericEntity>(type: reflection.EntityType<E>, raw: boolean, properties?: PartialProperties<E>, globalId?: string): E {
        const builder = this.session.createEntity(type);

        if (raw)
            builder?.raw();

        const entity = globalId? builder.global(globalId): builder.globalWithRandomUuid();

        if (properties)
            if (properties)
                Object.assign(entity, properties);

        return entity;
    }

    delete(entity: rM.GenericEntity): void {
        this.session.deleteEntity(entity)
    }

    get<E extends rM.GenericEntity>(_type: reflection.EntityType<E>, globalId: string): E {
        return this.session.getEntitiesView().findEntityByGlobalId(globalId);
    }

    list<E extends rM.GenericEntity>(type: reflection.EntityType<E>): E[] {
        return this.session.getEntitiesView().getEntitiesPerType(type).toArray();
    }

    openNestedFrame(extendOn?: mM.Manipulation): ManipulationFrame {
        return this.manipulationBuffer.openNestedFrame(extendOn);
    }

    async selectQuery(statement: string): Promise<session.SelectQueryResultConvenience> {
        return this.session.query().selectString(statement);
    }

    async entityQuery(statement: string): Promise<session.EntityQueryResultConvenience> {
        return this.session.query().entitiesString(statement);
    }

    async apply(manipulations: mM.Manipulation[]): Promise<void> {
        this.manipulationBuffer.suspendTracking();
        try {
            const manipulator = this.session.manipulate().mode(session.ManipulationMode.REMOTE);

            for (const m of manipulations) {
                manipulator.apply(m)
            }
        }
        finally {
            this.manipulationBuffer.resumeTracking();
        }
    }

    private async initialize(): Promise<void> {
        if (!this.initializers)
            return;

        for (const initializer of this.initializers) {
            await initializer(this);
        }
    }

    private createTransactionDataSigningMessageV2(id: string, sha256Hash: string): string {
        return `You are about to save data changes in ${this.security?.getSigningContextName()}.\n` +
               `Please sign this message to confirm the integrity of these changes.\n` +
               `The record ID is ${id}, and its hash is ${sha256Hash}.`;
    }

    private createTransactionDataSigningMessageV3(id: string, sha256Hash: string): string {
        return `${this.security?.getSigningContextName()}: ` +
                `Sign this message to confirm integrity of changes to be saved.\n` +
                `ID: ${id}, HASH: ${sha256Hash}.`;    
    }

    private async getBlobText(blob: Blob): Promise<string> {
        // Prüfen, ob `Blob.text()` verfügbar ist
        if (typeof blob.text === "function") {
            return blob.text();
        }
    
        // Falls nicht verfügbar: Fallback auf ArrayBuffer
        if (typeof blob.arrayBuffer === "function") {
            const arrayBuffer = await blob.arrayBuffer();
            return new TextDecoder().decode(arrayBuffer);
        }
    
        throw new Error("Blob.text() und Blob.arrayBuffer() sind nicht verfügbar.");
    }
    
    async load(): Promise<void> {
        // get database and fetch all transaction records from it
        let transactions = await (await this.getDatabase()).fetch()
        transactions = this.orderByDependency(transactions)

        this.manipulationBuffer.clear();
        this.manipulationBuffer.suspendTracking();

        await this.initialize();

        try {
            for (const t of transactions) {
                const marshaller = new ManipulationMarshaller();
                const payloadData = t.payload;

                let diffAsStr: string;

                if (typeof payloadData === "string") {
                    diffAsStr = payloadData as string;
                }
                else {
                    const blob = payloadData as Blob;
                    diffAsStr = await this.getBlobText(blob);
                }

                if (this.encryption) {
                    const decrypted = await this.encryption.decrypt(diffAsStr);;

                    if (decrypted == "")
                        throw ERROR_DECRYPTION_KEY;

                    diffAsStr = decrypted;
                }

                
                if (this.security) {
                    if (t.version == 1) {
                        const signerAddress = t.signer!.address;
                        if (!await this.security.verify(diffAsStr, t.signature, signerAddress))
                            // TODO: turn this into proper reasoning
                            throw ERROR_WRONG_SIGNATURE;
                    }
                    else if (t.version == 2) {
                        const hash = hashSha256(diffAsStr);
                        const message = this.createTransactionDataSigningMessageV2(t.id, hash);
                        const signerAddress = t.signer!.address;
                        if (!await this.security.verify(message, t.signature, signerAddress))
                            // TODO: turn this into proper reasoning
                            throw ERROR_WRONG_SIGNATURE;
                    }
                    else if (t.version == 3) {
                        const hash = hashSha256(diffAsStr);
                        const message = this.createTransactionDataSigningMessageV3(t.id, hash);
                        const signerAddress = t.signer!.address;
                        if (!await this.security.verify(message, t.signature, signerAddress))
                            // TODO: turn this into proper reasoning
                            throw ERROR_WRONG_SIGNATURE;
                    }
                    else
                        throw new Error("Unsupported CRDT-Transaction version: " + t.version)
                }

                const payload = JSON.parse(diffAsStr) as TransactionPayload;

                // TODO: check transaction fields for equality as additional check

                const diff = payload.diff;
                const manis = await marshaller.unmarshalFromJson(diff)
                const manipulator = this.session.manipulate().mode(session.ManipulationMode.REMOTE_GLOBAL);
                for (const manipulation of manis) {
                    manipulator.apply(manipulation);
                }
            }
        }
        finally {
            this.manipulationBuffer.resumeTracking();
        }

        // remember the id of the last transaction for linkage with an new transaction
        if (transactions.length > 0)
            this.lastTransactionId = transactions[transactions.length - 1].id

        if (this.draft) {
            await this.draft.load();
        }
    }

    async merge(_transactions: Transaction[]): Promise<void> {
        // TODO
    }

    async commit(signer?: Signer, withdrawn?: () => boolean): Promise<void> {
        const manis = this.manipulationBuffer.getCommitManipulations();
        // serialize the manipulations (currently as XML)
        const marshaller = new ManipulationMarshaller();
        const serManis = await marshaller.marshalToString(manis);

        // build a transaction record equipped with a new UUID, date and the serialized manipulations
        const transaction = {} as Transaction

        transaction.version = 3;
        transaction.id = util.newUuid();
        transaction.date = new Date().getTime();
        transaction.deps = [];
        transaction.signer = signer;

        // link the transaction to a previous one if present
        if (this.lastTransactionId !== undefined)
            transaction.deps.push(this.lastTransactionId)
        
        let diff = this.enrich(transaction, serManis);

        if (this.security) {
            if (!signer) 
                throw new Error("signer argument is required when working with security");

            const hash = hashSha256(diff);
            const message = this.createTransactionDataSigningMessageV3(transaction.id, hash);

            let signature: string;

            try {
                signature = await this.security.sign(message, signer.address);
            }
            catch (error) {
                if (withdrawn && withdrawn())
                    throw ERROR_SIGNING_WITHDRAWN;
                
                throw error;
            }

            if (withdrawn && withdrawn()) {
                throw ERROR_SIGNING_WITHDRAWN;
            }
            
            transaction.signature = signature;
            transaction.hash = hash;
        }

        if (this.encryption) {
            diff = await this.encryption.encrypt(diff);
        }

        const db = await this.getDatabase();

        if (db.supportsBlob()) 
            transaction.payload = new Blob([diff], { type: "text/plain" });
        else
            transaction.payload = diff;

        // append the transaction record to the database
        await db.append(transaction);

        // clear the manipulations as they are persisted
        this.manipulationBuffer.clear();

        // store the id of the appended transaction as latest transaction id
        this.lastTransactionId = transaction.id;

        if (this.draft)
            await this.draft.clear();
    }

    private enrich(transaction: Transaction, serManis: string): string {
        const builder: string[] = [];

        builder.push("{")

        for (const [key, value] of Object.entries(transaction)) {
            if (value === undefined)
                continue;

            builder.push('"');
            builder.push(key);
            builder.push('"');
            builder.push(": ");
            builder.push(JSON.stringify(value));
            builder.push(", ");
        }

        builder.push('"diff": ');
        builder.push(serManis);
        builder.push("}");

        const diff = builder.join("");

        return diff;
    }

    private async getDatabase(): Promise<Database> {
        if (this.databasePromise === undefined)
            this.databasePromise = Database.open(this.databaseName);

        return this.databasePromise;
    }

    private orderByDependency(transactions: Transaction[]): Transaction[] {
        const index = new Map<string, Transaction>();

        for (const t of transactions) {
            index.set(t.id, t)
        }

        const visited = new Set<Transaction>();
        const collect = new Array<Transaction>();

        for (const t of transactions) {
            this.collect(t, visited, collect, index)
        }

        return collect
    }

    private collect(transaction: Transaction, visited: Set<Transaction>, collect: Array<Transaction>, index: Map<string, Transaction>): void {
        if (visited.has(transaction))
            return

        visited.add(transaction)

        for (const dep of transaction.deps) {
            const depT = index.get(dep)!;
            this.collect(depT, visited, collect, index)
        }

        collect.push(transaction)
    }

    getDraft(): Draft | undefined {
        return this.draft;
    }
}

type DraftQueueEntry = [mM.Manipulation, boolean];
type DraftRecord = { version: number, seq: number, data: string, encrypted: boolean };

export interface Draft {
    waitForEmptyQueue(): Promise<void>;
    deferPersistence(defer: boolean): void;
    enableEncryption(enabled: boolean): void;
}

class DraftImpl implements Draft {
    private databaseProvider: () => Promise<Database>;
    private encryption?: ManagedEntitiesEncryption;
    private numSequence = 0;
    private queue: DraftQueueEntry[] = [];
    private readonly messageChannel = new MessageChannel();
    private marshaller = new ManipulationMarshaller();
    private loading = false;
    private session: session.ManagedGmSession;
    private deferred = false;
    private scheduled = false;
    private waitPromise?: AccessiblePromise<void>;
    private encryptionEnabled = true;
    
    constructor(databaseProvider: () => Promise<Database>, manipulationBuffer: ManipulationBuffer, session: session.ManagedGmSession, encryption?: ManagedEntitiesEncryption) {
        this.databaseProvider = databaseProvider;
        this.encryption = encryption;
        this.session = session;

        this.messageChannel.port1.onmessage = () => this.processQueue();
        manipulationBuffer.addBufferUpdateListener(this.onBufferUpdate.bind(this));
    }

    deferPersistence(defer: boolean): void {
        this.deferred = defer;
        this.scheduleIfRequired();
    }

    enableEncryption(enabled: boolean): void {
        this.encryptionEnabled = enabled;
    }

    async load(): Promise<void> {
        this.loading = true;
        try {
            const db = await this.databaseProvider();
            const draft = await db.fetchDraft();
            
            // execute them orderly
            draft.sort((e1, e2) => e1.seq - e2.seq);

            for (const entry of draft) {
                let data = entry.data;
                
                if (this.encryption && entry.encrypted) {
                    data = await this.encryption.decrypt(data);
                }

                const manipulations = await this.marshaller.unmarshalFromString(data);

                for (const manipulation of manipulations)
                    this.session.manipulate().mode(session.ManipulationMode.REMOTE_GLOBAL).apply(manipulation);
            }
        }
        finally {
            this.loading = false;
        }
    }

    async clear(): Promise<void> {
        await this.waitForEmptyQueue();
        const db = await this.databaseProvider();
        await db.clearDraft();
    }

    // TODO: think about listening to the buffer using commit manipulation instead of the session

    private onBufferUpdate(_buffer: ManipulationBuffer, event: ManipulationBufferEvent): void {
        if (this.loading)
            return;

        if (event.removedManipulation)
            this.enqueue(event.removedManipulation, false);

        if (event.addedManipulation)
            this.enqueue(event.addedManipulation);
    }

    private enqueue(manipulation: mM.Manipulation, add = true) {
        this.queue.push([manipulation, add]);
        this.scheduleIfRequired();
    }

    private scheduleIfRequired() {
        if (this.deferred || this.queue.length == 0 || this.scheduled)
            return;

        this.messageChannel.port2.postMessage(null);
        this.scheduled = true;
    }

    async waitForEmptyQueue(): Promise<void> {
        if (this.queue.length === 0)
            return;

        if (!this.waitPromise)
            this.waitPromise = new AccessiblePromise<void>();

        return this.waitPromise.promise;
    }

    private async processQueue(): Promise<void> {
        try {
            const db = await this.databaseProvider();
            while (true) {
                const entry = this.queue.shift();
                if (!entry)
                    return;

                if (entry[1]) {
                    // add
                    let data = await this.marshaller.marshalToString([entry[0]]);

                    let encrypted = false;

                    if (this.encryption && this.encryptionEnabled) {
                        data = await this.encryption.encrypt(data);
                        encrypted = true;
                    }

                    db.appendToDraft({version: 1, seq: this.numSequence++, data: data, encrypted})
                }
                else {
                    // remove
                    db.removeFromDraft(--this.numSequence);
                }
            }
        }
        finally {
            if (this.waitPromise) {
                this.waitPromise.resolve();
                this.waitPromise = undefined;
            }

            this.scheduled = false;
        }
    }
}

export type DatabaseInfo = {
    readonly name: string,
    readonly dbName: string,
    readonly version?: number;
}

export async function listDatabases(predicate: (dbName: string) => boolean): Promise<DatabaseInfo[]> {
    const databases = await indexedDB.databases();

    const infos: DatabaseInfo[] = [];

    for (const database of databases) {
        const dbName = database.name!;
        if (!predicate(dbName))
            continue;

        const db = await Database.open(dbName);
        const name = await db.getName();
        infos.push({name, dbName, version: database.version})
    }

    return infos;
}

type DatabaseMeta = {
    name: string,
    id: "meta"
}

/**
 * An append-only persistence for {@link Transaction transactions} based on {@link indexedDB}.
 * 
 * It allows to {@link Database.fetch|fetch} and {@link Database.append|append} {@link Transaction transactions}
 */
class Database {
    static readonly OBJECT_STORE_TRANSACTIONS = "transactions";
    static readonly OBJECT_STORE_DRAFT = "draft";
    static readonly OBJECT_STORE_META = "meta";

    private db: IDBDatabase;
    readonly name: string;

    constructor(databaseName: string, db: IDBDatabase) {
        this.name = databaseName;
        this.db = db;
    }

    supportsBlob(): boolean {
        return this.db instanceof IDBFactory;
    }

    private update(storeName: string, operation: (store: IDBObjectStore) => IDBRequest<any>): Promise<void> {
        return this.runTransaction(storeName, "readwrite", operation);
    }

    private read<T>(storeName: string, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        return this.runTransaction(storeName, "readonly", operation);
    }

    private addOrUpdate(storeName: string, record: any): Promise<void> {
        return this.update(storeName, store => store.add(record));
    }

    private get<T>(storeName: string, key: any): Promise<T> {
        return this.read(storeName, (store) => store.get(key));
    }

    private remove(storeName: string, key: any): Promise<void> {
        return this.update(storeName, (store) => store.delete(key));
    }

    private removeAll(storeName: string): Promise<void> {
        return this.update(storeName, (store) => store.clear());
    }

    private getAll<T>(storeName: string): Promise<T[]> {
        return this.read<T[]>(storeName, store => store.getAll());
    }

    /**
     * Helper to perform an operation in an IndexedDB transaction.
     * @param db - The IDBDatabase instance.
     * @param storeName - The name of the object store.
     * @param mode - The transaction mode ("readonly" or "readwrite").
     * @param operation - A callback that performs the operation within the transaction.
     * @returns A promise that resolves after the transaction completes.
     */
    private async runTransaction<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>, eagerConsumer?: (result: T) => void): Promise<T> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);

            let operationSuccessful = false; // Track if the operation succeeded

            const request = operation(store);

            request.onsuccess = () => {
                operationSuccessful = true;
                if (eagerConsumer)
                    eagerConsumer(request.result);
            };

            transaction.oncomplete = () => {
                if (operationSuccessful) {
                    resolve(request.result);
                } else {
                    reject(new Error("Transaction completed without a successful operation."));
                }
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    static async open(databaseName: string): Promise<Database> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 3);

            request.onupgradeneeded = () => Database.init(request.result);

            request.onsuccess = () => {
                const db = new Database(databaseName, request.result);
                resolve(db)
            }

            request.onerror = () => reject(request.error)
        });
    }

    async getMeta(): Promise<DatabaseMeta> {
        const meta = await this.get<DatabaseMeta>(Database.OBJECT_STORE_META, "meta");
        return meta || { id: "meta", name: "default"};
    }

    async getName(): Promise<string> {
        return (await this.getMeta()).name;
    }

    async setName(name: string): Promise<void> {
        const meta = await this.getMeta();      
        meta.name = name;  

        return this.addOrUpdate(Database.OBJECT_STORE_META, meta);
    }

    async fetch(): Promise<Transaction[]> {
        return this.getAll(Database.OBJECT_STORE_TRANSACTIONS);
    }

    append(transaction: Transaction): Promise<void> {
        return this.addOrUpdate(Database.OBJECT_STORE_TRANSACTIONS, transaction);
    }

    appendToDraft(record: DraftRecord): Promise<void> {
        return this.addOrUpdate(Database.OBJECT_STORE_DRAFT, record);
    }

    removeFromDraft(seq: number): Promise<void> {
        return this.remove(Database.OBJECT_STORE_DRAFT, seq);
    }

    fetchDraft(): Promise<DraftRecord[]> {
        return this.getAll(Database.OBJECT_STORE_DRAFT);
    }

    async clearDraft(): Promise<void> {
        await this.removeAll(Database.OBJECT_STORE_DRAFT);
    }

    private static init(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(Database.OBJECT_STORE_META)) {
            db.createObjectStore(Database.OBJECT_STORE_META, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(Database.OBJECT_STORE_TRANSACTIONS)) {
            db.createObjectStore(Database.OBJECT_STORE_TRANSACTIONS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(Database.OBJECT_STORE_DRAFT)) {
            db.createObjectStore(Database.OBJECT_STORE_DRAFT, { keyPath: 'seq' });
        }

    }
}