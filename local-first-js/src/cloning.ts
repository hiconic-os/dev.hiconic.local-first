import { GenericEntity } from "@dev.hiconic/gm_root-model";
import { hc, reflection, T } from "@dev.hiconic/tf.js_hc-js-api";

import Base = hc.Base;
import CollectionElement = hc.CollectionElement;

export type RawClone = {
    readonly clone: GenericEntity;
    readonly cloneProperties: boolean;
}


interface CloningContext {
    cloneValue<V extends Base>(value: V | null): V | null;

    cloneTypedValue<V extends Base>(inferredType: reflection.GenericModelType, value: V | null): V | null;

    cloneEntity<E extends GenericEntity>(entity: E): E;
}

export type RawCloner = (context: CloningContext, entity: GenericEntity) => RawClone;
export type PropertyTransferFilter = (context: CloningContext, entity: GenericEntity, clone: GenericEntity, property: reflection.Property, value: Base | null) => boolean;

export type CloningConfig = {
    rawCloner?: RawCloner;
    propertyExclusionFilter?: PropertyTransferFilter;
}

export function cloneValue<V extends Base | null>(value: V, config?: CloningConfig) {
    return new Cloning(config).cloneValue(value);
}

export function cloneTypedValue<V extends Base | null>(inferredType: reflection.GenericModelType, value: V, config?: CloningConfig) {
    return new Cloning(config).cloneTypedValue(inferredType, value);
}

export function cloneEntity<E extends GenericEntity>(entity: E, config?: CloningConfig) {
    return new Cloning(config).cloneEntity(entity);
}

export class Cloning implements CloningContext {
    private clones = new Map<GenericEntity, GenericEntity>();

    private rawCloner: RawCloner = (_c, e) => { 
        return { clone: e.EntityType().createRaw(), cloneProperties: true }
    };

    private propertyExclusionFilter?: PropertyTransferFilter;

    constructor(config?: CloningConfig) {
        if (config) {
            if (config.rawCloner)
                this.rawCloner = config.rawCloner;

            this.propertyExclusionFilter = config.propertyExclusionFilter;
        }
    }

    cloneValue<V extends Base>(value: V | null): V | null {
        return this.cloneTypedValue(reflection.OBJECT, value);
    }

    cloneTypedValue<V extends Base>(inferredType: reflection.GenericModelType, value: V | null): V | null {
        if (value === null)
            return null;

        if (inferredType.isBase()) 
            return this.cloneTypedValue(inferredType.getActualType(value), value);

        if (inferredType.isScalar())
            return value;

        if (inferredType.isEntity())
            return this.cloneEntity(value as GenericEntity) as V;

        if (inferredType.isCollection()) {
            switch (inferredType.getTypeName()) {
            case "list": return this.cloneList(value as T.Array<CollectionElement>, inferredType as reflection.ListType) as V;
            case "set": return this.cloneSet(value as T.Set<CollectionElement>, inferredType as reflection.SetType) as V;
            case "map": return this.cloneMap(value as T.Map<CollectionElement, CollectionElement>, inferredType as reflection.MapType) as V;
            }
        }

        throw new Error("unexpected state");
    }

    cloneEntity<E extends GenericEntity>(entity: E): E {
        let clone = this.clones.get(entity) as E | undefined;

        if (clone)
            return clone;

        const rawClone = this.rawCloner(this, entity);
        
        clone = rawClone.clone as E;
        this.clones.set(entity, clone);

        if (rawClone.cloneProperties)
            this.cloneProperties(entity, clone);

        return clone;
    }

    private cloneProperties(entity: GenericEntity, clone: GenericEntity): void {
        const exlusion = this.propertyExclusionFilter;
        for (const property of entity.EntityType().getProperties().iterable()) {
            const inferredType = property.getType();
            const value = property.get(entity) as Base;

            if (exlusion && exlusion(this, entity, clone, property, value))
                continue;

            const clonedValue = this.cloneTypedValue(inferredType, value);
            property.set(clone, clonedValue);
        }
    }

    private cloneMap(map: T.Map<CollectionElement, CollectionElement>, mapType: reflection.MapType): T.Map<CollectionElement,CollectionElement>  {
        const keyType = mapType.getKeyType();
        const valueType = mapType.getValueType();
        const clonedMap = new T.Map(keyType as reflection.BaseType, valueType as reflection.BaseType);

        for (const entry of map.entries()) {
            const key = entry[0];
            const value = entry[1];
            const clonedKey = this.cloneTypedValue(keyType, key);
            const clonedValue = this.cloneTypedValue(valueType, value);
            clonedMap.set(clonedKey, clonedValue);
        }

        return clonedMap;
    } 

    private cloneList(list: T.Array<CollectionElement>, listType: reflection.ListType): T.Array<CollectionElement>  {
        const elementType = listType.getCollectionElementType();
        const clonedList = new T.Array(elementType as reflection.BaseType);

        for (const element of list) {
            const clonedElement = this.cloneTypedValue(elementType, element);
            clonedList.push(clonedElement);
        }

        return clonedList;
    } 

    private cloneSet(set: T.Set<CollectionElement>, setType: reflection.SetType): T.Set<CollectionElement>  {
        const elementType = setType.getCollectionElementType();
        const clonedList = new T.Set(elementType as reflection.BaseType);

        for (const element of set) {
            const clonedElement = this.cloneTypedValue(elementType, element);
            clonedList.add(clonedElement);
        }

        return clonedList;
    } 
}