import { session, reflection, util } from "@dev.hiconic/tf.js_hc-js-api";
import * as mM from "@dev.hiconic/gm_manipulation-model";
import * as rM from "@dev.hiconic/gm_root-model";
import { ManipulationBuffer, ManipulationBufferUpdateListener, SessionManipulationBuffer } from "./manipulation-buffer.js";
import { ManipulationMarshaller } from "./manipulation-marshaler.js";


export type { ManipulationBuffer, ManipulationBufferUpdateListener };

export type ManagedEntitiesConfig = {
    auth?: ManagedEntitiesAuth, 
    encryption?: ManagedEntitiesEncryption,
    dataInitializers?: DataInitializer[]
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

interface TransactionMeta {
    version: number;
    deps: string[];
    id: string;
    date: number;
}

/**
 * Describes a transaction that is modelled in a way that it can be stored as JSON-like structure in the {@link indexedDB}
 */
interface Transaction extends TransactionMeta {
    signer?: Signer;
    hash: string;
    signature: string;
    payload: string;
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
     * @param globalId the globalId of the entity
     */
    get<E extends rM.GenericEntity>(globalId: string): E;

    list<E extends rM.GenericEntity>(type: reflection.EntityType<E>): E[];

    beginCompoundManipulation(): void;

    endCompoundManipulation(): void;

    compoundManipulation<R>(manipulator: () => R): R;

    /**
     * Establishes a state within the {@link ManagedEntities.session|session} by applying the given manipulations.
     */
    apply(manipulations: mM.Manipulation[]): Promise<void>

    /**
     * Establishes a state within the {@link ManagedEntities.session|session} by loading and applying changes from the event-source persistence.
     */
    load(): Promise<void>;

    /**
     * Persists the recorded and collected {@link mM.Manipulation manipulations} by appending them as a transaction to the event-source persistence.
     */
    commit(signer?: Signer): Promise<void>;

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

    constructor(databaseName: string, config?: ManagedEntitiesConfig) {
        this.databaseName = databaseName
        this.manipulationBuffer = new SessionManipulationBuffer(this.session);
        this.security = config?.auth;
        this.encryption = config?.encryption;
        this.initializers = config?.dataInitializers;
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

    get<E extends rM.GenericEntity>(globalId: string): E {
        return this.session.getEntitiesView().findEntityByGlobalId(globalId);
    }

    list<E extends rM.GenericEntity>(type: reflection.EntityType<E>): E[] {
        return this.session.getEntitiesView().getEntitiesPerType(type).toArray();
    }

    beginCompoundManipulation(): void {
        this.manipulationBuffer.beginCompoundManipulation();
    }

    endCompoundManipulation(): void {
        this.manipulationBuffer.endCompoundManipulation();
    }

    compoundManipulation<R>(manipulator: () => R): R {
        return this.manipulationBuffer.compoundManipulation(manipulator);
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
                let diffAsStr = t.payload as string;

                if (this.encryption) {
                    diffAsStr = await this.encryption.decrypt(diffAsStr);
                }

                if (this.security) {
                    const signerAddress = t.signer!.address;
                    if (!await this.security.verify(diffAsStr, t.signature, signerAddress))
                        // TODO: turn this into proper reasoning
                        throw new Error("wrong signature");
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
    }

    async commit(signer?: Signer): Promise<void> {
        const manis = this.manipulationBuffer.getCommitManipulations();
        // serialize the manipulations (currently as XML)
        const marshaller = new ManipulationMarshaller();
        const serManis = await marshaller.marshalToString(manis);

        // build a transaction record equipped with a new UUID, date and the serialized manipulations
        const transaction = {} as Transaction

        transaction.version = 1;
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

            const hash = await this.security.hash(diff);
            const signature = await this.security.sign(diff, signer.address);
            
            transaction.signature = signature;
            transaction.hash = hash;
        }

        if (this.encryption) {
            diff = await this.encryption.encrypt(diff);
        }

        transaction.payload = diff;

        // append the transaction record to the database
        await (await this.getDatabase()).append(transaction)

        // clear the manipulations as they are persisted
        this.manipulationBuffer.clear();

        // store the id of the appended transaction as latest transaction id
        this.lastTransactionId = transaction.id
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

}

/**
 * An append-only persistence for {@link Transaction transactions} based on {@link indexedDB}.
 * 
 * It allows to {@link Database.fetch|fetch} and {@link Database.append|append} {@link Transaction transactions}
 */
class Database {
    static readonly OBJECT_STORE_TRANSACTIONS = "transactions";

    private db: IDBDatabase;
    readonly name: string;

    constructor(databaseName: string, db: IDBDatabase) {
        this.name = databaseName;
        this.db = db;
    }

    static async open(databaseName: string): Promise<Database> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 2);

            request.onupgradeneeded = () => Database.init(request.result);

            request.onsuccess = () => {
                const db = new Database(databaseName, request.result);
                resolve(db)
            }

            request.onerror = () => reject(request.error)
        });
    }

    async fetch(): Promise<Transaction[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(Database.OBJECT_STORE_TRANSACTIONS, 'readonly');
            const objectStore = transaction.objectStore(Database.OBJECT_STORE_TRANSACTIONS);

            const request = objectStore.getAll();

            request.onsuccess = () => {
                // automatically casting result to Transaction[] as we know this is the content of the db
                resolve(request.result)
            }

            request.onerror = () => reject(request.error)
        });
    }

    append(transaction: Transaction): Promise<void> {
        return new Promise((resolve, reject) => {
            const dbTransaction = this.db.transaction(Database.OBJECT_STORE_TRANSACTIONS, 'readwrite');
            const objectStore = dbTransaction.objectStore(Database.OBJECT_STORE_TRANSACTIONS);

            const request = objectStore.add(transaction)

            request.onsuccess = () => {
                resolve();
            }

            request.onerror = () => reject(request.error)
        });
    }

    private static init(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(Database.OBJECT_STORE_TRANSACTIONS)) {
            db.createObjectStore(Database.OBJECT_STORE_TRANSACTIONS, { keyPath: 'id' });
        }
    }
}