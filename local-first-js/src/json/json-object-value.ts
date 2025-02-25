import { NotFound, InvalidArgument } from "@dev.hiconic/gm_essential-reason-model";
import { GenericEntity } from "@dev.hiconic/gm_root-model";
import { ConversionContext } from "./conversion-context.js";
import { JsonComplexValue } from "./json-complex-value.js";
import { JsonField } from "./json-field.js";
import { JsonLocation } from "./json-location.js";
import { JsonName } from "./json-name.js";
import { JsonValue } from "./json-value.js";
import { SpecialFields } from "./special-field.js";
import { hc, reflection, T } from "@dev.hiconic/tf.js_hc-js-api";
import { ConversionError } from "./conversion-error.js";
import { IdentityManagementMode } from "./identity-management-mode.js";
import { EntityBuilder } from "./entity-builder.js";

const STRING_OBJECT_MAP_TYPE = reflection.typeReflection().getMapType(reflection.STRING, reflection.OBJECT);

export class JsonObjectValue extends JsonComplexValue {
	private fields: JsonField[] = [];
	private _refField?: JsonField;
	private _typeField?: JsonField;
	private _idField?: JsonField;
	private idField?: JsonField;
	private globalIdField?: JsonField;
	
	constructor(context: ConversionContext, start: JsonLocation) {
		super(context, start);
	}

	addValue(name: JsonName, value: JsonValue): void {
		const field = this.buildField(name, value);
		this.fields.push(field);
	}

	private buildField(name: JsonName, value: JsonValue): JsonField  {
		const n = name.getValue();
		
		const specialField = this.conversionContext.detectSpecialField(n);
		
		if (!specialField)
			return new JsonField(name, value, true);
		
		const field = new JsonField(name, value, specialField.isProperty);
		
		switch (specialField) {
			case SpecialFields._id: this._idField = field; break;
			case SpecialFields._ref: this._refField = field; break;
			case SpecialFields._type: this._typeField = field; break;
			case SpecialFields.id: this.idField = field; break;
			case SpecialFields.globalId: this.globalIdField = field; break;
		}
		
		return field;
	}
	
	onEnd(): void {
	}

	determineType(value: JsonValue): reflection.GenericModelType {
		const type = value.asString();
		
		const gmType = reflection.typeReflection().findType(type);
		
		if (gmType != null)
			return gmType;
		
		// special type
		switch (type) {
			case "flatmap": return reflection.MAP;
			case "map": return reflection.MAP;
			case "set": return reflection.SET;
			default: {
				const msg = "Unknown type [" + type + "] " + value.getErrorLocation();
				const notFound = NotFound.create();
				notFound.text = msg;
				throw new ConversionError(notFound);
			}
		}
	}
	
	as(inferredType: reflection.GenericModelType): hc.Base | null {
		switch (inferredType.getTypeCode()) {
			case reflection.TypeCode.objectType: 
				return this.asObject();
			case reflection.TypeCode.entityType: 
				return this.asEntity(inferredType as reflection.EntityType<GenericEntity>);
			case reflection.TypeCode.mapType: 
				return this.asMap(inferredType as reflection.MapType);
			default:
				return this.typedAs(inferredType);
		}
	}
	
	private asObject(): hc.Base | null {
		if (this._typeField) {
			return this.typedAs(reflection.OBJECT);
		}
		else if (this.conversionContext.identityManagedMode() == IdentityManagementMode._id && this._refField) {
			return this.asRef(GenericEntity);
		}

		return this.asNativeMap(STRING_OBJECT_MAP_TYPE);
	}
	
	private typedAs(inferredType: reflection.GenericModelType): hc.Base | null {
		const explicitType = this.determineType(this._typeField!.value);

		let value: hc.Base | null = null;
		
		if (explicitType.isEntity()) {
			value = this.buildEntity(explicitType as reflection.EntityType<GenericEntity>);
		}
		else {
			const jsonValue = this.getSpecialValue();
			value = jsonValue.as(explicitType);
		}

		if (value != null && !inferredType.isInstance(value))
			throw this.typeMismatchError(inferredType, explicitType);
		
		return value;
	}
	
	private asMap(mapType: reflection.MapType): T.Map<hc.CollectionElement, hc.CollectionElement> {
		if (this._typeField != null) {
			return this.typedAs(mapType) as T.Map<hc.CollectionElement, hc.CollectionElement>;
		}
		
		return this.asNativeMap(mapType);
	}
	
	private asNativeMap(mapType: reflection.MapType): T.Map<hc.CollectionElement, hc.CollectionElement> {
		
		const map = new T.Map();;
		
		const keyType = mapType.getKeyType();
		const valueType = mapType.getValueType();
		
		for (const field of this.fields) {
			let key: hc.CollectionElement | null = null;
			let value: hc.CollectionElement | null = null;
			
			try {
				key = field.name.as(keyType) as hc.CollectionElement; 
			}
			catch (e) {
				if (e instanceof ConversionError) {
					const reason = InvalidArgument.create();
					reason.text = "Invalid map key " + field.name.start.toString();
					throw new ConversionError(reason, e);
				}
			}
			
			try {
				value = field.value.as(valueType) as hc.CollectionElement; 
			}
			catch (e) {
				if (e instanceof ConversionError) {
					const reason = InvalidArgument.create();
					reason.text = "Invalid map value " + field.value.start.toString();
					throw new ConversionError(reason, e);
				}
			}
			
			map.set(key!, value!);
		}
		
		return map;
	}
	
	private asRef(inferredType: reflection.EntityType<GenericEntity>): GenericEntity {
		if (this.fields.length != 1) {
			const invalidArgument = InvalidArgument.create();
			invalidArgument.text = "Invalid entity reference object literal due to invalid fields " + this.start.toString();
			throw new ConversionError(invalidArgument);
		}
		
		const ref = this._refField!.value.asString();
		
		const entity = this.conversionContext.resolveReference(ref);
		
		if (entity == null) {
			const notFound = NotFound.create();
			notFound.text = "No entity with ref id [" + ref + "] found " + this._refField!.value.start.toString();
			throw new ConversionError(notFound);
		}
		
		if (!inferredType.isAssignableFrom(entity.EntityType()))
			throw this.typeMismatchError(inferredType, entity.EntityType());
		
		return entity;
	}

	private concretizeEntityType(inferredType: reflection.EntityType<GenericEntity>): reflection.EntityType<GenericEntity> {
		if (!this._typeField)
			return inferredType;
		
		const explicitType = this.determineType(this._typeField.value);
		
		if (inferredType.isAssignableFrom(explicitType))
			return explicitType as reflection.EntityType<GenericEntity>;
	
		throw this.typeMismatchError(inferredType, explicitType);
	}
	
	/**
	 * @throws {ConversionError}
	 */ 
	private asEntityOrRecurrence(inferredType: reflection.EntityType<GenericEntity>): GenericEntity  {
		const concreteType = this.concretizeEntityType(inferredType);
		
		if (this.idField) {
			const entityId = this.idField.value.as(reflection.OBJECT);
			const entity = this.conversionContext.resolveEntityById(concreteType, entityId!);
			
			if (entity)
				return entity;
		}
		
		if (this.globalIdField) {
			const entityGlobalId = this.globalIdField.value.asString();
			
			const entity = this.conversionContext.resolveEntityByGlobalId(entityGlobalId);
			
			if (entity != null)
				return entity;
		}
		
		return this.buildEntity(concreteType);
	}

	/**
	 * @throws {ConversionError}
	 */ 
	private asEntity(inferredEntityType: reflection.EntityType<GenericEntity>): GenericEntity {
		if (this._typeField) {
			return this.typedAs(inferredEntityType) as GenericEntity;
		}
		else {
			switch (this.conversionContext.identityManagedMode()) {
				case IdentityManagementMode._id:
					if (this._refField) 
						return this.asRef(inferredEntityType);
					break;
					
				case IdentityManagementMode.id:
					if (this.idField || this.globalIdField)
						return this.asEntityOrRecurrence(inferredEntityType);
					break;
					
				case IdentityManagementMode.auto: break;
				case IdentityManagementMode.off: break;
			}
		}
			
		return this.buildEntity(inferredEntityType);
	}
	
	/**
	 * @throws {ConversionError}
	 */ 
	private buildEntity(entityType: reflection.EntityType<GenericEntity>): GenericEntity{
		
		if (entityType.isAbstract())
			entityType = this.resolvePolymorphicType(entityType);
		
		const entity = this.conversionContext.createEntity(entityType);
		const entityBuilder = new EntityBuilder(entity, this.conversionContext);
		
		this.registerEntityIfRequired(entity);
		
		for (const field of this.fields) {
			if (!field.property)
				continue;
			
			entityBuilder.setField(field);
		}
		
		return entity;
	}

	/**
	 * @throws {ConversionError}
	 */ 
	private resolvePolymorphicType(entityType: reflection.EntityType<GenericEntity>): reflection.EntityType<GenericEntity> {
		const specificProperties = this.conversionContext.getTypeSpecificProperties(entityType);
		
		for (const field of this.fields) {
			if (!field.property)
				continue;
			
			const propertyName = field.name.getValue();
			
			const result = specificProperties.get(propertyName);
			
			if (result)
				return result;
		}
		
		const notFound = NotFound.create();
		notFound.text = "Cannot resolve polymorphic ambiguity for abstract entity type [" + entityType.getTypeSignature() + "] " + this.getErrorLocation();
		
		throw new ConversionError(notFound);
	}

	/**
	 * @throws {ConversionError}
	 */ 
	private registerEntityIfRequired(entity: GenericEntity): void {
		if (this._idField) {
			const refId = this._idField.value.asString();
			
			if (!this.conversionContext.registerEntityByReference(entity, refId)) {
				const invalidArgument = InvalidArgument.create();
				invalidArgument.text = "Duplicate _id [" + this.idField?.name + "] for entity";
				throw new ConversionError(invalidArgument);
			}
		}
		
		if (this.idField) {
			const entityId = this.idField.value.as(reflection.OBJECT);
			
			if (entityId)
				this.conversionContext.registerEntityById(entity, entityId);
		}
		
		if (this.globalIdField) {
			const entityGlobalId = this.globalIdField.value.asString();
			this.conversionContext.registerEntityByGlobalId(entity, entityGlobalId);
		}
	}

	/**
	 * @throws {ConversionError}
	 */ 
	private getSpecialValue(): JsonValue {
		if (!this._typeField) {
			const notFound = NotFound.create();
			notFound.text = "Missing _type field " + this._refField!.value.start.toString();
				
			throw new ConversionError(notFound);
		}
		
		for (const field of this.fields) {
			if (field === this._typeField)
				continue;
			
			const name = field.name.getValue();
			if (name === "value") {
				return field.value;
			}
			else {
				const invalidArgument = InvalidArgument.create();
				invalidArgument.text = "Invalid value object literal due to invalid fields " + this.start.toString();
				
				throw new ConversionError(invalidArgument);
			}
		}

		const notFound = NotFound.create();
		notFound.text = "Missing value field " + this._refField!.value.start.toString();
			
		throw new ConversionError(notFound);
	}
}
