import { eval_, service, session, modelpath, remote, reason, reflection, util, manipulation } from "@dev.hiconic/tf.js_hc-js-api";
import * as mM from "@dev.hiconic/gm_manipulation-model";
import * as rM from "@dev.hiconic/gm_root-model";
import { ManipulationBuffer, ManipulationBufferUpdateListener, SessionManipulationBuffer } from "./manipulation-buffer";
import { PersistentEntityReference, GlobalEntityReference } from "@dev.hiconic/gm_value-descriptor-model";

export type { ManipulationBuffer, ManipulationBufferUpdateListener };

/** 
 * Opens a {@link ManagedEntities} instance backed by the indexedDB named "event-source-db".
 * @param databaseName name of the ObjectStore used as space for the stored events
 */
export function openEntities(databaseName: string): ManagedEntities {
    return new ManagedEntitiesImpl(databaseName)
}

export type PartialProperties<T> = Partial<
  Pick<T, { [K in keyof T]: T[K] extends Function ? never : K }[keyof T]>
>;

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
    commit(): Promise<void>;

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

    constructor(databaseName: string) {
        this.databaseName = databaseName
        this.manipulationBuffer = new SessionManipulationBuffer(this.session);
    }

    create<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): E {
        return this.initAndAttach(type.create(), properties);
    }

    createRaw<E extends rM.GenericEntity>(type: reflection.EntityType<E>, properties?: PartialProperties<E>): E {
        return this.initAndAttach(type.createRaw(), properties);
    }

    private initAndAttach<E extends rM.GenericEntity>(entity: E, properties?: PartialProperties<E>): E {
        if (properties)
            Object.assign(entity, properties);

        if (!entity.globalId)
            entity.globalId = util.newUuid();

        const m = mM.InstantiationManipulation.create();
        m.entity = entity;

        this.session.manipulate().mode(session.ManipulationMode.LOCAL).apply(m);

        return entity;
    }

    delete(entity: rM.GenericEntity): void {
        this.session.deleteEntity(entity)
    }

    get<E extends rM.GenericEntity>(globalId: string): E {
        return null! as E; // TODO fix this: this.session.qwe
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

    async load(): Promise<void> {
        // get database and fetch all transaction records from it
        let transactions = await (await this.getDatabase()).fetch()
        transactions = this.orderByDependency(transactions)
        
        this.manipulationBuffer.clear();
        this.manipulationBuffer.suspendTracking();
        try {
            for (const t of transactions) {
                const m = await manipulation.ManipulationSerialization.deserializeManipulation(t.diff);
                this.session.manipulate().mode(session.ManipulationMode.REMOTE).apply(m)
            }
        }
        finally {
            this.manipulationBuffer.resumeTracking();
        }

        // remember the id of the last transaction for linkage with an new transaction
        if (transactions.length > 0)
            this.lastTransactionId = transactions[transactions.length - 1].id
    }

    async commit(): Promise<void> {
        const manis = this.manipulationBuffer.getCommitManipulations();
        // serialize the manipulations (currently as XML)
        const diff = await manipulation.ManipulationSerialization.serializeManipulations(manis, true)

        // build a transaction record equipped with a new UUID, date and the serialized manipulations
        const transaction = {} as Transaction
        transaction.id = util.newUuid()
        transaction.diff = diff
        transaction.date = new Date().getTime()
        transaction.deps = []
        
        // link the transaction to a previous one if present
        if (this.lastTransactionId !== undefined)
            transaction.deps.push(this.lastTransactionId)

        // append the transaction record to the database
        await (await this.getDatabase()).append(transaction)

        // clear the manipulations as they are persisted
        this.manipulationBuffer.clear();
        
        // store the id of the appended transaction as latest transaction id
        this.lastTransactionId = transaction.id
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
 * Describes a transaction that is modelled in a way that it can be stored as JSON-like structure in the {@link indexedDB}
 */
interface Transaction {
    deps: string[]
    id: string
    diff: string
    date: number
}

/**
 * An append-only persistence for {@link Transaction transactions} based on {@link indexedDB}.
 * 
 * It allows to {@link Database.fetch|fetch} and {@link Database.append|append} {@link Transaction transactions}
 */
class Database {

    private db: IDBDatabase;
    private databaseName: string;

    constructor(databaseName: string, db: IDBDatabase) {
        this.databaseName = databaseName;
        this.db = db;
    }

    static async open(databaseName: string): Promise<Database> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("event-source-db", 2);
            
            request.onupgradeneeded = () => Database.init(databaseName,request.result);
            
            request.onsuccess = () => {
                const db = new Database(databaseName, request.result);
                resolve(db)
            }

            request.onerror = () => reject(request.error)
        });
    }

    async fetch(): Promise<Transaction[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.databaseName], 'readonly');
            const objectStore = transaction.objectStore(this.databaseName);
    
            const request = objectStore.getAll();
            const transactions = new Array<Transaction>();

            request.onsuccess = () => {
                resolve(request.result)
            }
    
            request.onerror = () => reject(request.error)
        });
    }

    append(transaction: Transaction): Promise<void> {
        return new Promise((resolve, reject) => {
            const dbTransaction = this.db.transaction([this.databaseName], 'readwrite');
            const objectStore = dbTransaction.objectStore(this.databaseName);
    
            const request = objectStore.add(transaction)
            
            request.onsuccess = () => {
                resolve();
            }
    
            request.onerror = () => reject(request.error)
        });
    }

    private static init(databaseName: string, db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(databaseName)) {
            db.createObjectStore(databaseName, { keyPath: 'id' });
        }
    }


}