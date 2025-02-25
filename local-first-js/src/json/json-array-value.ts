import { InvalidArgument } from "@dev.hiconic/gm_essential-reason-model";
import { hc, reflection, T } from "@dev.hiconic/tf.js_hc-js-api";
import { ConversionContext } from "./conversion-context.js";
import { ConversionError } from "./conversion-error.js";
import { JsonComplexValue } from "./json-complex-value.js";
import { JsonLocation } from "./json-location.js";
import { JsonName } from "./json-name.js";
import { JsonValue } from "./json-value.js";

export class JsonArrayValue extends JsonComplexValue {
	private values: JsonValue[] = [];

	constructor(conversionContext: ConversionContext, start: JsonLocation) {
		super(conversionContext, start);
	}
	
	
	public addValue(_name: JsonName, value: JsonValue): void {
		this.values.push(value);
	}
	
	public onEnd(): void {
	}
	
	public inferType(_type: reflection.GenericModelType): void {
	}
	
	/**
	 * @throws {ConversionError}
	 */ 
	public as(inferredType: reflection.GenericModelType): hc.Base | null {
		
		switch (inferredType.getTypeCode()) {
			case reflection.TypeCode.objectType: return this.asListType(reflection.LIST);
			case reflection.TypeCode.listType: return this.asListType(inferredType as reflection.ListType);
			case reflection.TypeCode.setType: return this.asSetType(inferredType as reflection.SetType);
			case reflection.TypeCode.mapType: return this.asMap(inferredType as reflection.MapType);
				
			default: {
				const msg = "Array literal cannot be converted to type [" + inferredType.getTypeSignature() + "] " + this.getErrorLocation();
				const invalidArgument = InvalidArgument.create();
				invalidArgument.text = msg;
				throw new ConversionError(invalidArgument);
			}
		}
	}
	
	/**
	 * @throws {ConversionError}
	 */ 
	private asMap(mapType: reflection.MapType): T.Map<hc.CollectionElement, hc.CollectionElement> {
		const keyType = mapType.getKeyType() as reflection.BaseType;
		const valueType = mapType.getValueType() as reflection.BaseType;

		const map = new T.Map(keyType, valueType);
		
		let keyJsonValue: JsonValue | null = null;
		let key: hc.CollectionElement | null = null;
		
		for (const jsonValue of this.values) {
			if (keyJsonValue == null) {
				keyJsonValue = jsonValue;
				try {
					key = jsonValue.as(keyType) as hc.CollectionElement;
				}
				catch (e) {
					if (e instanceof ConversionError) {
						const reason = InvalidArgument.create();
						reason.text = "Invalid map key " + jsonValue.getStart().toString();
						throw new ConversionError(reason, e);
					}
					throw e;
				}
			}
			else {
				keyJsonValue = null;
				try {
					const value = jsonValue.as(valueType) as hc.CollectionElement | null;
					map.set(key!, value!);
				}
				catch (e) {
					if (e instanceof ConversionError) {
						const reason = InvalidArgument.create();
						reason.text = "Invalid map value " + jsonValue.getStart().toString(); 
						throw new ConversionError(reason, e);
					}

					throw e;
				}
			}
		}
		
		if (keyJsonValue) {
			const reason = InvalidArgument.create();
			reason.text = "Missing value for map key " + keyJsonValue.getErrorLocation(); 
			throw new ConversionError(reason);
		}
		
		return map;
	}

	/**
	 * @throws {ConversionError}
	 */ 
	private asListType(collectionType: reflection.ListType): T.Array<hc.CollectionElement>{
		const elementType = collectionType.getCollectionElementType() as reflection.BaseType;
		const list = new T.Array(elementType);
		
		for (const value of this.values) {
			try {
				const element = value.as(elementType) as hc.CollectionElement | null;
				list.push(element!);
			}
			catch (e) {
				if (e instanceof ConversionError) {
					const reason = InvalidArgument.create();
					reason.text = "Invalid " + collectionType.getTypeName() + " element " + value.getStart().toString();
					throw new ConversionError(reason, e);
				}

				throw e;
			}
		}
		
		return list;
	}

	/**
	 * @throws {ConversionError}
	 */ 
	private asSetType(collectionType: reflection.SetType): T.Set<hc.CollectionElement>{
		const elementType = collectionType.getCollectionElementType() as reflection.BaseType;
		const list = new T.Set(elementType);
		
		for (const value of this.values) {
			try {
				const element = value.as(elementType) as hc.CollectionElement | null;
				list.add(element!);
			}
			catch (e) {
				if (e instanceof ConversionError) {
					const reason = InvalidArgument.create();
					reason.text = "Invalid " + collectionType.getTypeName() + " element " + value.getStart().toString();
					throw new ConversionError(reason, e);
				}

				throw e;
			}
		}
		
		return list;
	}
}
