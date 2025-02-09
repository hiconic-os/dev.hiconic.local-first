import * as mM from "@dev.hiconic/gm_manipulation-model";
import * as rM from "@dev.hiconic/gm_root-model";
import { Accessor, createEffect, createSignal, Setter, Signal, onCleanup } from "solid-js";
import { manipulation, reflection, session } from "@dev.hiconic/tf.js_hc-js-api";
import { ManipulationBuffer } from "./manipulation-buffer.js";

type NonFunctionKeys<T> = Exclude<{
  [K in keyof T]: K extends string? (T[K] extends Function ? never : K) : never;
}[keyof T], never>;


export interface EntityManipulation<E extends rM.GenericEntity> {
  readonly entity: E;
  readonly manipulation?: mM.Manipulation;
}

export interface EntityRelatedSignal<E extends rM.GenericEntity> {
  readonly entity: E;
}

export interface EntitySignal<E extends rM.GenericEntity> extends EntityRelatedSignal<E> {
  readonly get: Accessor<EntityManipulation<E>>;
}

export interface CollectionManipulation<E extends rM.GenericEntity, C> {
  readonly entity: E;
  readonly collection: C;
  readonly manipulation?: mM.PropertyManipulation;
}


export interface EntityCollectionPropertySignal<E extends rM.GenericEntity, C> extends EntityRelatedSignal<E> {
  readonly get: Accessor<CollectionManipulation<E, C>>;
}

export interface EntityPropertySignal<E extends rM.GenericEntity, V> extends EntityRelatedSignal<E>, Signal<V>  {
  readonly property: reflection.Property;
}

export interface EntitySignalBuilder<E extends rM.GenericEntity> {
  all(): EntitySignal<E>;
  property<K extends NonFunctionKeys<E>>(property: reflection.Property | K): EntityPropertySignal<E, E[K]>;
  collectionProperty<K extends NonFunctionKeys<E>>(property: reflection.Property | K): EntityCollectionPropertySignal<E, E[K]>;
}

/** Reflects the manipulation buffer state, typically used for undo/redo/save functionality in UI (see {@link manipulationBufferSignal}) */
export interface ManipulationBufferState {
   /** True if there is at least one manipulation that can be undone */
   readonly canUndo: boolean;
   /** True if there is at least one manipulation that can be redone */
   readonly canRedo: boolean;
   /** True if there is at least one manipulation to be committed (semantic alias of {@link canUndo}) */
   readonly canCommit: boolean;
   /** The number of manipulations that can be redone. */
   readonly redoCount: number;
   /** The number of manipulations that can be redone. */
   readonly undoCount: number;
}

interface HasDisposer {
  readonly disposer: () => void;
}

/** Creates a signal containing the buffer's current state and returns the signal's getter. */
export function manipulationBufferSignal(buffer: ManipulationBuffer): Accessor<ManipulationBufferState> {
  const state: ManipulationBufferState = createBufferState(buffer);
  /** Initialize the signal with the buffer's current state */
  const [getter, setter] = createSignal(state);

  /** Connects the signal's setter with buffer listening */
  buffer.addBufferUpdateListener(() => setter(createBufferState(buffer)));

  return getter;
}

function createBufferState(buffer: ManipulationBuffer): ManipulationBufferState {
  return {
    canUndo: buffer.canUndo(),
    canRedo: buffer.canRedo(),
    canCommit: buffer.canUndo(),
    redoCount: buffer.tailCount(),
    undoCount: buffer.headCount()
  };
}

class EntityPropertySignalImpl<E extends rM.GenericEntity, V> extends Array<any> implements EntityPropertySignal<E, V>, HasDisposer {
  0: Accessor<V>;
  1: Setter<V>;
  readonly entity: E;
  readonly property: reflection.Property;
  readonly disposer: () => void;
  
  constructor(entity: E, property: reflection.Property, signal: Signal<V>, disposer: () => void) {
    super(signal, disposer);
    this[0] = signal[0];
    this[1] = signal[1];
    this.entity = entity;
    this.property = property;
    this.disposer = disposer;
  }
  
  get length(): 2 { return 2 };
}

class EntitySignalImpl<E extends rM.GenericEntity> implements EntitySignal<E>, HasDisposer {
  readonly entity: E;
  readonly get: Accessor<EntityManipulation<E>>;
  readonly set: Setter<EntityManipulation<E>>; 
  readonly disposer: () => void;
  
  constructor(entity: E, signal: Signal<EntityManipulation<E>>, disposer: () => void) {
    this.entity = entity;
    this.get = signal[0];
    this.set = signal[1];
    this.disposer = disposer;
  }
}

class EntityCollectionPropertySignalImpl<E extends rM.GenericEntity, C> implements EntityCollectionPropertySignal<E, C>, HasDisposer {
  readonly entity: E;
  readonly get: Accessor<CollectionManipulation<E, C>>;
  readonly set: Setter<CollectionManipulation<E, C>>; 
  readonly disposer: () => void;
  
  constructor(entity: E, signal: Signal<CollectionManipulation<E, C>>, disposer: () => void) {
    this.entity = entity;
    this.get = signal[0];
    this.set = signal[1];
    this.disposer = disposer;
  }
}

/** 
 * A ReactivityScope {@link ReactivityScope.signal creates} and manages the connection between hiconic entities from a {@link session.ManagedGmSession session} and 
 * {@link Signal solid-js signals}. It should be {@link ReactivityScope.close closed} when a solid-js component is {@link onCleanup cleaned up}.
 * 
 */
export class ReactivityScope {
  private session: session.ManagedGmSession;
  private propertySignals = new Map<string, EntityPropertySignalImpl<any, any>>();
  private collectionPropertySignals = new Map<string, EntityCollectionPropertySignalImpl<any, any>>();
  private entitySignals = new Map<rM.GenericEntity, EntitySignalImpl<any>>();
  
  constructor(session: session.ManagedGmSession, autoClose = false) {
    this.session = session;
    if (autoClose)
      onCleanup(() => this.close());
  }

  close() {
    this.propertySignals.forEach(s => s.disposer());
    this.propertySignals.clear();
    this.entitySignals.forEach(s => s.disposer());
    this.entitySignals.clear();
    this.collectionPropertySignals.forEach(s => s.disposer());
    this.collectionPropertySignals.clear();
  } 


  signal<E extends rM.GenericEntity>(entity: E): EntitySignalBuilder<E> {
    return {
      all: () => this.acquireEntitySignal(entity),
      property: <K extends NonFunctionKeys<E>>(property: reflection.Property | K) => this.propertySignal(entity, property),
      collectionProperty: <K extends NonFunctionKeys<E>>(property: reflection.Property | K) => this.collectionPropertySignal(entity, property)
    };
  }

  private acquireEntitySignal<E extends rM.GenericEntity>(entity: E): EntitySignal<E> {
    let signal = this.entitySignals.get(entity) as EntitySignalImpl<E>;

    if (signal !== undefined) return signal;

    signal = this.newEntitySignal(entity);

    this.entitySignals.set(entity, signal);

    return signal;
  }

  newEntitySignal<E extends rM.GenericEntity>(entity: E): EntitySignalImpl<E> {
    const signal = createSignal<EntityManipulation<E>>({ entity: entity });

    const setValue = signal[1];

    const listener: manipulation.ManipulationListener = {
      onMan: m => setValue({ entity: entity, manipulation: m })
    };

    const listeners = this.session.listeners().entity(entity);
    listeners.add(listener);

    const disposer = () => {
      listeners.remove(listener);
    };

    return new EntitySignalImpl(entity, signal, disposer);
  }

  collectionPropertySignal<E extends rM.GenericEntity, C>(entity: E, property: reflection.Property | string): EntityCollectionPropertySignal<E, C> {
    const refProp = typeof property == "string" ? 
    entity.EntityType().getProperty(property as string) : 
    property as reflection.Property;

    return this.acquireCollectionPropertySignal(entity, refProp);
  }

  acquireCollectionPropertySignal<E extends rM.GenericEntity, C>(entity: E, property: reflection.Property): EntityCollectionPropertySignal<E, C> {
    const key = entity.RuntimeId() + ":" + property.getName();
    
    let signal = this.collectionPropertySignals.get(key) as EntityCollectionPropertySignalImpl<E, C>;

    if (signal !== undefined) return signal;

    signal = this.newEntityCollectionPropertySignal<E,C>(entity, property);

    this.collectionPropertySignals.set(key, signal);

    return signal;
  }

  private newEntityCollectionPropertySignal<E extends rM.GenericEntity, C>(entity: E, property: reflection.Property): EntityCollectionPropertySignalImpl<E, C> {
    const collection = property.get(entity) as C;
    
    const signal = createSignal<CollectionManipulation<E,C>>({ entity, collection });

    const setValue = signal[1];

    const listener: manipulation.ManipulationListener = {
      onMan: m => {
        const col = property.get(entity) as C;
        setValue({ entity: entity, manipulation: m as mM.PropertyManipulation, collection: col})
      }
    };

    const listeners = this.session.listeners().entityProperty(entity, property.getName());
    listeners.add(listener);

    const disposer = () => {
      listeners.remove(listener);
    };

    return new EntityCollectionPropertySignalImpl(entity, signal, disposer);
  }

  propertySignal<E extends rM.GenericEntity, V>(entity: E, property: reflection.Property | string): EntityPropertySignal<E, V> {
    const refProp = typeof property == "string" ? 
    entity.EntityType().getProperty(property as string) : 
    property as reflection.Property;

    return this.acquirePropertySignal(entity, refProp);
  }

  private acquirePropertySignal<E extends rM.GenericEntity, V>(entity: E, property: reflection.Property): EntityPropertySignal<E, V> {
    const key = entity.RuntimeId() + ":" + property.getName();

    let signal = this.propertySignals.get(key);

    if (signal !== undefined) return signal;

    signal = this.newPropertySignal(entity, property);

    this.propertySignals.set(key, signal);

    return signal;
  }

  private newPropertySignal<E extends rM.GenericEntity, V>(entity: E, property: reflection.Property): EntityPropertySignalImpl<E, V> {
    const signal = createSignal<V>(property.get(entity));
    const [value, setValue] = signal;

    createEffect(() => {
      const v = value();

      const existingValue = property.get(entity);

      if (existingValue === v)
        return;

      property.set(entity, v);
    });

    const listener: manipulation.ManipulationListener = {
      onMan: async m => {
        const cvm = m as mM.ChangeValueManipulation;
        const v = cvm.newValue as Exclude<V, Function>;
        setValue(v);
      }
    };

    const listeners = this.session.listeners().entityProperty(entity, property.getName());
    listeners.add(listener);


    const disposer = () => {
      listeners.remove(listener);
    };

    return new EntityPropertySignalImpl(entity, property, signal, disposer);

  }
}