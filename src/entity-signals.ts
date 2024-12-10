import * as mM from "@dev.hiconic/gm_manipulation-model";
import * as rM from "@dev.hiconic/gm_root-model";
import { Accessor, createEffect, createSignal, Setter, Signal } from "solid-js";
import { manipulation, reflection, session } from "@dev.hiconic/tf.js_hc-js-api";

type NonFunctionKeys<T> = Exclude<{
  [K in keyof T]: K extends string? (T[K] extends Function ? never : K) : never;
}[keyof T], never>;

const a: Array<number> = [];


export interface EntityPropertySignal<E extends rM.GenericEntity, V> {
  getter: Accessor<V>;
  setter: Setter<V>;
  entity: E;
  property: reflection.Property;
}

interface EntitySignalBuilder<E extends rM.GenericEntity> {
  property<K extends NonFunctionKeys<E>>(property: reflection.Property | K): EntityPropertySignal<E, E[K]>;
}

class EntityPropertySignalImpl<E extends rM.GenericEntity, V> implements EntityPropertySignal<E, V> {
  getter: Accessor<V>;
  setter: Setter<V>;
  entity: E;
  property: reflection.Property;
  disposer: () => void;

  constructor(entity: E, property: reflection.Property, signal: Signal<V>, disposer: () => void) {
    this.entity = entity;
    this.property = property;
    this.getter = signal[0];
    this.setter = signal[1];
    this.disposer = disposer;
  }
}

export class ReactivityScope {
  private session: session.ManagedGmSession;
  private signals = new Map<string, EntityPropertySignalImpl<any, any>>();
  
  constructor(session: session.ManagedGmSession) {
    this.session = session;
  }

  close() {
    this.signals.forEach(s => s.disposer());
    this.signals.clear();
  } 

  signal<E extends rM.GenericEntity>(entity: E): EntitySignalBuilder<E> {
    return {
      property: <K extends NonFunctionKeys<E>>(property: reflection.Property | K) => this.propertySignal(entity, property)
    };
  } 

  propertySignal<E extends rM.GenericEntity, V>(entity: E, property: reflection.Property | string): EntityPropertySignal<E, V> {
    const refProp = typeof property == "string" ? 
    entity.EntityType().getProperty(property as string) : 
    property as reflection.Property;

    return this.acquirePropertySignal(entity, refProp);
  }

  private acquirePropertySignal<E extends rM.GenericEntity, V>(entity: E, property: reflection.Property): EntityPropertySignal<E, V> {
    const key = entity.RuntimeId() + ":" + property.getName();

    let signal = this.signals.get(key);

    if (signal !== undefined) return signal;

    signal = this.newPropertySignal(entity, property);

    this.signals.set(key, signal);

    return signal;
  }


  private newPropertySignal<E extends rM.GenericEntity, V>(entity: E, property: reflection.Property): EntityPropertySignalImpl<E, V> {
    const signal = createSignal<V>(property.get(entity));
    const [value, setValue] = signal;

    let blockReactivity = true;

    try {
      createEffect(() => {
        const v = value();
        if (blockReactivity) return;
        property.set(entity, v);
      });
    } finally {
      blockReactivity = false;
    }

    const listener: manipulation.ManipulationListener = {
      onMan: m => {
        const cvm = m as mM.ChangeValueManipulation;
        const v: Exclude<V, Function> = cvm.newValue;
        blockReactivity = true;
        try {
          setValue(v);
        } finally {
          blockReactivity = false;
        }
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

