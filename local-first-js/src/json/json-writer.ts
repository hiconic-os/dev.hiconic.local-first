import { AbsenceInformation } from "@dev.hiconic/gm_absence-information-model";
import { GenericEntity } from "@dev.hiconic/gm_root-model";
import { hc, reflection, T } from "@dev.hiconic/tf.js_hc-js-api";

import EntityType = reflection.EntityType;
import GenericModelType = reflection.GenericModelType;
import TypeCode = reflection.TypeCode;

export enum OutputPrettiness {
    none, low, mid, high
}

export enum TypeExplicitness {
    	/**
	 * The marshaller decides which of the other options it will choose. Look at the inidividual marshaller's to see for the individual case. 
	 */
	auto, 
	
	/**
	 * The types are made explicit to allow to preserve the correct type under all circumstances which means not to rely on any contextual
	 * information to auto convert it from another type.
	 */
	always,
	
	/**
	 * The types are made explicit for entities in all cases and the other values can get simpler types if appropriate and the context of the value
	 * can give the information to reestablish the correct type with an auto conversion.
	 */
	entities, 

	/**
	 * The types are made explicit if the actual type cannot be reestablished from the context of the value which is the case that value is
	 * a concretization of the type given by the context.
	 */
	polymorphic, 
	
	/**
	 * The types are never made explicit under no circumstances.
	 */
	never
}

export type EntityVisitor = (entity: GenericEntity) => void;
export type PropertyNameSupplier = (property: reflection.Property) => string;
export type MarshallingOptions = {
    inferredRootType?: GenericModelType;
    scalarsFirst?: boolean;
    useDirectPropertyAccess?: boolean;
    writeEmptyProperties?: boolean;
    writeAbsenceInformation?: boolean;
    stringifyNumbers?: boolean;
    entityRecurrenceDepth?: number;
    entityVisitor?: EntityVisitor;
    propertyNameSupplier?: PropertyNameSupplier;
    typeExplicitness?: TypeExplicitness;
    prettiness?: OutputPrettiness;
}

export interface JsonWriterResult {
	asString(): string;
	asBlob(): Blob;
}

class Writer implements JsonWriterResult {
    readonly chunks: string[] = [];
	private text?: string;
	private blob?: Blob;

    write(s: string): void {
        this.chunks.push(s);
    }

	asString(): string {
		if (!this.text)	{
			this.text = this.chunks.join("");
		}

		return this.text;
	}

	asBlob(): Blob {
		if (!this.blob) {
			this.blob = new Blob(this.chunks);
		}
		return this.blob;
	}
}

abstract class PrettinessSupport {
    abstract writeLinefeed(writer: Writer, indent: number): void;
	abstract readonly maxIndent: number;
}

class NoPrettinessSupport extends PrettinessSupport {
    readonly maxIndent = 0;
	writeLinefeed(_writer: Writer, _indent: number): void { /*Intentionally left empty*/ }
}

class LowPrettinessSupport extends PrettinessSupport {
    readonly maxIndent = 0;
	writeLinefeed(writer: Writer, _indent: number): void { writer.write('\n'); }
}


const nullLiteral = "null";
const trueLiteral = "true";
const falseLiteral = "false";

const openTypedValue = "{\"value\":";
const openTypedQuotedValue = "{\"value\":\"";
const closeDouble = ", \"_type\":\"double\"}";
const closeFloat = ", \"_type\":\"float\"}";
const closeDate = "\", \"_type\":\"date\"}";
const closeDecimal = "\", \"_type\":\"decimal\"}";
const closeLong = "\", \"_type\":\"long\"}";
const midEnum = "\", \"_type\":\"";
const closeEnum = "\"}";
const emptyList = "[]";
const openSet = "{\"_type\": \"set\", \"value\":[";
const emptySet = "{\"_type\": \"set\", \"value\":[]}";
// const openMap = "{\"_type\": \"map\", \"value\":[";
const openFlatMap = "{\"_type\": \"flatmap\", \"value\":[";
// const emptyMap = "{\"_type\": \"map\", \"value\":[]}";
const emptyMap = "{}";
const emptyFlatMap = "{\"_type\": \"flatmap\", \"value\":[]}";
const closeTypedCollection = "]}";
// const openEntry = "{\"key\":";
// const midEntry = ", \"value\":";


class ConfigurablePrettinessSupport extends PrettinessSupport {
	private readonly linefeeds: string[];
	private readonly maxLinefeed: string;
    readonly maxIndent;
	
    constructor(maxIndent: number) {
        super();
        this.linefeeds = Array.from({ length: maxIndent }, (_, i) => "\n" + " ".repeat(i))
        this.maxLinefeed = this.linefeeds[maxIndent - 1];
        this.maxIndent = maxIndent;
    }

    writeLinefeed(writer: Writer, indent: number): void {
        const feed = this.linefeeds[indent] || this.maxLinefeed;
		writer.write(feed);
	}
}

function buildPrettinessSupport(prettiness: OutputPrettiness) {
    switch (prettiness) {
        case OutputPrettiness.none: return new NoPrettinessSupport();
        case OutputPrettiness.low: return new LowPrettinessSupport();
        case OutputPrettiness.mid: return new ConfigurablePrettinessSupport(10);
        case OutputPrettiness.high: return new ConfigurablePrettinessSupport(20);
        default: return new NoPrettinessSupport();
    }
}

const openEntityRef = "{\"_ref\": \"";
const closeEntityRef = "\"}";
const openEntity = "{\"_type\": \"";
const openTypeFreeEntity = "{\"_id\": \"";
const openTypeFreeEntityNoId = "{";
const idPartEntity = "\", \"_id\": \"";
const openEntityFinish = "\"";
const midProperty = "\": ";
const openAbsentProperty = "\"?";

type TypeEncoder<T extends GenericModelType, V extends hc.Base> = (ctxType: GenericModelType, superType: T, value: V, simp: boolean, isId: boolean) => void;

type PropertyInfo = {
    property: reflection.Property;
    propertyName: string;
    typeEncoder: TypeEncoder<GenericModelType, hc.Base>;
}

type EntityTypeInfo = {
    readonly entityType: EntityType<GenericEntity>;
    readonly typeSignature: string;
    readonly propertyInfos: PropertyInfo[];
}


export class JsonWriter {

	private readonly writer = new Writer();
	private readonly idByEntities = new Map<GenericEntity, number>();
	private readonly recursiveRecurrenceSet = new Set<GenericEntity>();
	private readonly entityTypeInfos = new Map<EntityType<GenericEntity>, EntityTypeInfo>();
	private readonly useDirectPropertyAccess: boolean;
	private readonly writeEmptyProperties: boolean;
	private readonly canSkipNonPolymorphicType: boolean;
	private readonly writeSimplifiedValues: boolean;
	private readonly typeExplicitness: TypeExplicitness;
	private readonly writeAbsenceProperties: boolean;
	private readonly stringifyNumbers: boolean;
	private readonly entityVisitor?: EntityVisitor;
	private readonly propertyNameSupplier?: PropertyNameSupplier;
	private readonly prettinessSupport: PrettinessSupport;
	private readonly rootType: GenericModelType;
	private readonly entityRecurrenceDepth: number;
	private readonly scalarsFirst: boolean;
    private readonly encoders = new Map<reflection.TypeCode, TypeEncoder<GenericModelType, hc.Base>>();
	
	private indent = 0;
	private idSequence = 0;
	private currentRecurrenceDepth = 0;

	constructor(options: MarshallingOptions) {
		this.rootType = options?.inferredRootType || reflection.OBJECT;
		this.useDirectPropertyAccess = options?.useDirectPropertyAccess || false;
		this.writeEmptyProperties = options?.writeEmptyProperties || false;
		this.writeAbsenceProperties = options?.writeAbsenceInformation || true;
		this.stringifyNumbers = options?.stringifyNumbers || false;
		this.prettinessSupport = buildPrettinessSupport(options?.prettiness || OutputPrettiness.high);
		this.entityRecurrenceDepth = options?.entityRecurrenceDepth || 0;
		this.entityVisitor = options?.entityVisitor;
		this.propertyNameSupplier = options?.propertyNameSupplier;
		this.typeExplicitness = options?.typeExplicitness || TypeExplicitness.auto;
		this.scalarsFirst = options?.scalarsFirst || false;

        this.registerEncoder(reflection.OBJECT, this.encodeBase);
        this.registerEncoder(reflection.BOOLEAN, this.encodeBoolean);
        this.registerEncoder(reflection.STRING, this.encodeString);
        this.registerEncoder(reflection.INTEGER, this.encodeInteger);
        this.registerEncoder(reflection.LONG, this.encodeLong);
        this.registerEncoder(reflection.FLOAT, this.encodeFloat);
        this.registerEncoder(reflection.DOUBLE, this.encodeDouble);
        this.registerEncoder(reflection.DECIMAL, this.encodeDecimal);
        this.registerEncoder(reflection.DATE, this.encodeDate);
        this.registerEncoder(reflection.LIST, this.encodeList);
        this.registerEncoder(reflection.SET, this.encodeSet);
        this.registerEncoder(reflection.MAP, this.encodeMap);
        this.registerEncoder(GenericEntity, this.encodeEntity);
        this.registerEncoderByTypeCode(TypeCode.enumType, this.encodeEnum);

		switch (this.typeExplicitness) {
			case TypeExplicitness.auto:
			case TypeExplicitness.entities:
				this.canSkipNonPolymorphicType = false;
				this.writeSimplifiedValues = true;
				break;
			case TypeExplicitness.never:
			case TypeExplicitness.polymorphic:
				this.canSkipNonPolymorphicType = true;
				this.writeSimplifiedValues = true;
				break;
            case TypeExplicitness.always:
            default:
                this.canSkipNonPolymorphicType = false;
                this.writeSimplifiedValues = false;
                break;
		}
	}

    private registerEncoder<T extends GenericModelType, V extends hc.Base>(type: T, typeEncoder: TypeEncoder<T, V>) {
        this.registerEncoderByTypeCode(type.getTypeCode(), typeEncoder as TypeEncoder<GenericModelType, hc.Base>);
    }

    private registerEncoderByTypeCode<T extends GenericModelType, V extends hc.Base>(typeCode: TypeCode, typeEncoder: TypeEncoder<T, V>) {
        this.encoders.set(typeCode, typeEncoder as TypeEncoder<GenericModelType, hc.Base>);
    }

    private buildPropertyInfo(property: reflection.Property): PropertyInfo {
        return {
            property,
            propertyName: this.propertyNameSupplier?.(property) || property.getName(),
            typeEncoder: this.resolveEncoder(property.getType())
        };
    }

    private buildEntityTypeInfo(entityType: EntityType<GenericEntity>): EntityTypeInfo {
        let propertyInfos = [...entityType.getProperties().iterable()].map(p => this.buildPropertyInfo(p));

        if (this.scalarsFirst) {
            propertyInfos = [
                ...propertyInfos.filter(p => p.property.getType().isScalar()), 
                ...propertyInfos.filter(p => !p.property.getType().isScalar())
            ];
        }

        return {
            entityType,
            typeSignature: entityType.getTypeSignature(),
            propertyInfos
        }
    }

	private resolveEncoder(type: GenericModelType): TypeEncoder<GenericModelType, hc.Base> {
		const encoder = this.encoders.get(type.getTypeCode());
		if (!encoder)
			throw new Error("could not resolve encoder for type " + type.getTypeSignature());

		return encoder; 
	}

	public write(value: hc.Base | null): JsonWriterResult {
		try {
			const rootEncoder = this.resolveEncoder(this.rootType);
			this.marshall(this.rootType, value, rootEncoder, false);
			return this.writer;
		} catch (e) {
			throw new Error("error while marshalling json", {cause: e});
		}
	}

    private marshall(ctxType: GenericModelType, value: hc.Base | null, typeEncoder: TypeEncoder<GenericModelType, hc.Base>, isId: boolean): void {
		if (value === null) {
			this.writer.write(nullLiteral);
			return;
		}

		typeEncoder(ctxType, ctxType, value, this.writeSimplifiedValues, isId);
	}

    private allowsTypeExplicitness(): boolean {
		return this.typeExplicitness !== TypeExplicitness.never;
	}

    private writeValue(open: string, value: { toString: () => string }, close: string): void  {
		this.writer.write(open);
		this.writer.write(value.toString());
		this.writer.write(close);
	}

	private writeSimplifiedNumberType(value: { toString: () => string }): void {
		if (this.stringifyNumbers) {
			this.writer.write('"');
			this.writer.write(value.toString());
			this.writer.write('"');
		} else {
			this.writer.write(value.toString());
		}
	}

    private acquireEntityTypeInfo(entityType: EntityType<GenericEntity>): EntityTypeInfo {
        let info = this.entityTypeInfos.get(entityType);

        if (!info) {
            info = this.buildEntityTypeInfo(entityType);
            this.entityTypeInfos.set(entityType, info);
        }

        return info;
	}

	private encodeBase = (ctxType: GenericModelType, _superType: reflection.BaseType, value: hc.Base, simp: boolean, isId: boolean): void => {
        const actualType = ctxType.getActualType(value);
        
        if (actualType == null || actualType == ctxType)
            throw new Error("Cannot marshall value " + value + " as its type was resolved as " + actualType);

        let simpValues = false;
        if (isId && simp && actualType.isScalar())
            simpValues = true;
        else if (!this.allowsTypeExplicitness())
            simpValues = true;

        const typeEncoder = this.resolveEncoder(actualType);
        typeEncoder(ctxType, actualType, value, simpValues, isId);
    }

    private encodeBoolean = (_ctxType: GenericModelType, _superType: reflection.BooleanType, value: boolean, _simp: boolean, _isId: boolean): void => {
        if (value)
            this.writer.write(trueLiteral);
        else
            this.writer.write(falseLiteral);
	}

	private encodeString = (_ctxType: GenericModelType, _superType: reflection.StringType, value: string, _simp: boolean, _isId: boolean): void => {
        this.writer.write(JSON.stringify(value));
	}

	private encodeDate = (_ctxType: GenericModelType, _superType: reflection.DateType, value: Date, simp: boolean, _isId: boolean): void => {
        if (simp) {
            this.writer.write('"');
            this.writer.write(value.toISOString());
            this.writer.write('"');
        } else {
            this.writer.write(openTypedQuotedValue);
            this.writer.write(value.toISOString());
            this.writer.write(closeDate);
        }
	}

	private encodeInteger = (_ctxType: GenericModelType, _superType: reflection.IntegerType, value: number, _simp: boolean, _isId: boolean): void => {
		this.writer.write(value.toString());
	}

    private encodeDouble = (_ctxType: GenericModelType, _superType: reflection.DoubleType, value: T.Double, simp: boolean, _isId: boolean): void => {
        if (simp)
            this.writer.write(value.toString());
        else
            this.writeValue(openTypedValue, value, closeDouble);
    }

    private encodeFloat = (_ctxType: GenericModelType, _superType: reflection.FloatType, value: T.Float, simp: boolean, _isId: boolean): void => {
        if (simp)
            this.writer.write(value.toString());
        else
        this.writeValue(openTypedValue, value, closeFloat);
    }

    private encodeLong = (_ctxType: GenericModelType, _superType: reflection.LongType, value: bigint, simp: boolean, _isId: boolean): void => {
        if (simp)
            this.writeSimplifiedNumberType(value);
        else
        this.writeValue(openTypedQuotedValue, value, closeLong);
    }

    private encodeDecimal = (_ctxType: GenericModelType, _superType: reflection.DecimalType, value: T.Decimal, simp: boolean, _isId: boolean): void => {
        if (simp)
            this.writeSimplifiedNumberType(value);
        else
            this.writeValue(openTypedQuotedValue, value, closeDecimal);
	}

    private encodeEnum = (_ctxType: GenericModelType, superType: reflection.EnumType<any>, value: hc.Enum<any>, simp: boolean, _isId: boolean): void => {
        if (simp) {
            this.writer.write('"');
            this.writer.write(value.toString());
            this.writer.write('"');
        } else {
            this.writer.write(openTypedQuotedValue);
            this.writer.write(value.toString());
            this.writer.write(midEnum);
            this.writer.write(superType.getTypeSignature());
            this.writer.write(closeEnum);
        }
	}

    private encodeList = (_ctxType: GenericModelType, superType: reflection.ListType, value: T.Array<hc.CollectionElement | null>, _simp: boolean, _isId: boolean): void => {
        this.marshallCollection(superType, value, value.length);
	}

    private encodeSet = (_ctxType: GenericModelType, superType: reflection.SetType, collection: T.Set<hc.CollectionElement | null>, simp: boolean, _isId: boolean): void => {
        if (simp) {
            this.marshallCollection(superType, collection, collection.size);
        } else {
            if (collection.size === 0) {
                this.writer.write(emptySet);
                return;
            }
            this.writer.write(openSet);
            this.marshallCollectionElements(superType, collection);
            this.writer.write(closeTypedCollection);
        }
    }

    private marshallCollection(collectionType: reflection.CollectionType, collection: Iterable<hc.CollectionElement | null>, size: number): void {
		if (size == 0) {
			this.writer.write(emptyList);
			return;
		}
		
        this.writer.write('[');
        this.marshallCollectionElements(collectionType, collection);
		this.writer.write(']');
	}

    private marshallCollectionElements(collectionType: reflection.CollectionType, collection: Iterable<hc.Base | null>): void {
		let i = 0;
		const elementType = collectionType.getCollectionElementType();
		const elementTypeEncoder = this.resolveEncoder(elementType);
		this.indent++;
		for (const e of collection) {
			if (i > 0)
				this.writer.write(',');

            this.prettinessSupport.writeLinefeed(this.writer, this.indent);
            this.marshall(elementType, e, elementTypeEncoder, false);
			i++;
		}
		this.indent--;
		this.prettinessSupport.writeLinefeed(this.writer, this.indent);
    }

    private encodeMap = (_ctxType: GenericModelType, superType: reflection.MapType, map: T.Map<hc.CollectionElement | null, hc.CollectionElement | null>, simp: boolean, _isId: boolean): void => {
        let i = 0;

        const keyType = superType.getKeyType();
        const valueType = superType.getValueType();
        const keyTypeEncoder = this.resolveEncoder(keyType);
        const valueTypeEncoder = this.resolveEncoder(valueType);

        const isStringKey = keyType == reflection.STRING;
        const isEnumKey = keyType.isEnum();
        const writeSimpleFlatMap = !this.allowsTypeExplicitness() || isStringKey || (isEnumKey && simp);

		if (map.size === 0) {
			if (writeSimpleFlatMap) {
				this.writer.write(emptyMap);
			} else {
				this.writer.write(emptyFlatMap);
			}
            return;
        }
		
        if (writeSimpleFlatMap) {
            this.writer.write('{');
        } else {
            this.writer.write(openFlatMap);
        }

        const elementIndent = this.indent + 1;
        this.indent += 2;
        for (const entry of map.entries()) {
            if (i > 0)
                this.writer.write(',');
            this.prettinessSupport.writeLinefeed(this.writer, elementIndent);
            this.marshall(keyType, entry[0], keyTypeEncoder, false);
            if (writeSimpleFlatMap) {
                this.writer.write(':');
            } else {
                this.writer.write(',');
            }
            this.marshall(valueType, entry[1], valueTypeEncoder, false);
            i++;
        }
        this.indent -= 2;
        this.prettinessSupport.writeLinefeed(this.writer, this.indent);
        if (writeSimpleFlatMap) {
            this.writer.write('}');
        } else {
            this.writer.write(closeTypedCollection);
        }
    }

    private encodeEntity = (ctxType: GenericModelType, _superType: reflection.EntityType<GenericEntity>, entity: GenericEntity, _simp: boolean, _isId: boolean): void => {
        const entityTypeInfo = this.acquireEntityTypeInfo(entity.EntityType());

        if (this.entityRecurrenceDepth == 0) {
            this.marsallEntityWithZeroRecurrenceDepth(entity, entityTypeInfo, ctxType);
        } else {
            this.marsallEntityWithRecurrenceDepth(entity, entityTypeInfo, ctxType);
        }
    }

	private marsallEntityWithRecurrenceDepth(entity: GenericEntity, typeInfo: EntityTypeInfo , ctxType: GenericModelType): void {
		const isInRecurrence = this.currentRecurrenceDepth > 0;
		if (isInRecurrence || this.lookupId(entity) != null) {

			this.currentRecurrenceDepth++;
			try {
				this._marshallEntity(entity, typeInfo, ctxType);
			} finally {
				this.currentRecurrenceDepth--;
			}

		} else {
			this.register(entity);
			this._marshallEntity(entity, typeInfo, ctxType);
		}
	}

	private _marshallEntity(entity: GenericEntity, typeInfo: EntityTypeInfo , ctxType: GenericModelType): void {
        const recursiveVisit = this.recursiveRecurrenceSet.has(entity);

        if (!recursiveVisit)
            this.recursiveRecurrenceSet.add(entity);
		
		try {
			const onlyScalars = recursiveVisit || this.isRecurrenceMax();

			const skipType = this.canSkipType(typeInfo, ctxType);
			if (skipType) {
				this.writer.write(openTypeFreeEntityNoId);
			} else {
				this.writer.write(openEntity);
				this.writer.write(typeInfo.typeSignature);
				this.writer.write(openEntityFinish);
			}

			let wroteProperty = false;
			this.indent++;
			for (let i = 0, len = typeInfo.propertyInfos.length; i < len; i++) {
				const propertyInfo = typeInfo.propertyInfos[i];
				const property = propertyInfo.property;

				const propertyType = property.getType();
				if (!propertyType.isScalar() && onlyScalars) {
					continue;
				}

				const value = this.getProperty(entity, property);

				if (value === null) {
					const absenceInformation = property.getAbsenceInformation(entity);
					if (absenceInformation == null) {
						if (!this.writeEmptyProperties)
							continue;
					} else {
						if (this.writeAbsenceProperties) {
							if (!skipType || wroteProperty)
								this.writer.write(',');
							this.prettinessSupport.writeLinefeed(this.writer, this.indent);
							this.writer.write(openAbsentProperty);
							this.writer.write(propertyInfo.propertyName);
							this.writer.write(midProperty);
							this.marsallEntityWithRecurrenceDepth(absenceInformation, this.absenceInfoTypeInfo(), AbsenceInformation);
							wroteProperty = true;
						}
						continue;
					}

				} else {
					if (!this.writeEmptyProperties && propertyType.getTypeCode() != TypeCode.objectType && propertyType.isEmpty(value))
						continue;
				}

				if (!skipType || wroteProperty)
					this.writer.write(',');

				this.prettinessSupport.writeLinefeed(this.writer, this.indent);
				this.writer.write('"');
				this.writer.write(propertyInfo.propertyName);
				this.writer.write(midProperty);

				this.marshall(propertyType, value, propertyInfo.typeEncoder, property.isIdentifier());
				wroteProperty = true;
			}
			this.indent--;

			if (wroteProperty)
				this.prettinessSupport.writeLinefeed(this.writer, this.indent);

			this.writer.write('}');

		} catch (e) {
			throw new Error("error while encoding entity", {cause: e});
		} finally {
			if (!recursiveVisit)
				this.recursiveRecurrenceSet.delete(entity);
		}
	}

	private isRecurrenceMax(): boolean {
		if (this.entityRecurrenceDepth < 0) {
			return false;
		}
		return this.currentRecurrenceDepth >= this.entityRecurrenceDepth;
	}

	private marsallEntityWithZeroRecurrenceDepth(entity: GenericEntity, typeInfo: EntityTypeInfo , ctxType: GenericModelType): void {
		const indentLimit = this.prettinessSupport.maxIndent - 4;
		const canIncreaseIndent = this.indent < indentLimit;

		let refId = this.lookupId(entity);
		if (refId) {
			this.writer.write(openEntityRef);
			this.writer.write(refId.toString());
			this.writer.write(closeEntityRef);
			return;
		}

		try {
			const skipType = this.canSkipType(typeInfo, ctxType);
			if (skipType) {
				this.writer.write(openTypeFreeEntity);
			} else {
				this.writer.write(openEntity);
				this.writer.write(typeInfo.typeSignature);
				this.writer.write(idPartEntity);
			}

			refId = this.register(entity);
			this.writer.write(refId.toString());

			this.writer.write(openEntityFinish);

			if (canIncreaseIndent)
				this.indent++;

			let wroteProperty = false;
			for (let i = 0, len = typeInfo.propertyInfos.length; i < len; i++) {
				const propertyInfo = typeInfo.propertyInfos[i];
				const property = propertyInfo.property;

				const propertyType = property.getType();

				const value = this.getProperty(entity, property);

				if (value == null) {

					const absenceInformation = property.getAbsenceInformation(entity);
					if (absenceInformation == null) {
						if (!this.writeEmptyProperties)
							continue;

					} else {
						if (this.writeAbsenceProperties) {
							this.writer.write(',');
							this.prettinessSupport.writeLinefeed(this.writer, this.indent);
							this.writer.write(openAbsentProperty);
							this.writer.write(propertyInfo.propertyName);
							this.writer.write(midProperty);
							this.marsallEntityWithZeroRecurrenceDepth(absenceInformation, this.absenceInfoTypeInfo(), AbsenceInformation);
							wroteProperty = true;
						}
						continue;
					}

				} else {
					if (!this.writeEmptyProperties && propertyType.getTypeCode() != TypeCode.objectType && propertyType.isEmpty(value))
						continue;
				}

				this.writer.write(',');
				this.prettinessSupport.writeLinefeed(this.writer, this.indent);
				this.writer.write('"');
				this.writer.write(propertyInfo.propertyName);
				this.writer.write(midProperty);

				this.marshall(propertyType, value, propertyInfo.typeEncoder, property.isIdentifier());
				wroteProperty = true;
			}
			if (canIncreaseIndent)
				this.indent--;

			if (wroteProperty)
				this.prettinessSupport.writeLinefeed(this.writer, this.indent);

			this.writer.write('}');

		} catch (e) {
			throw new Error("error while encoding entity", {cause: e});
		}
	}

	private canSkipType(typeInfo: EntityTypeInfo, ctxType: GenericModelType ): boolean {
		return !this.allowsTypeExplicitness() || (this.canSkipNonPolymorphicType && ctxType == typeInfo.entityType);
	}

	private getProperty(entity: GenericEntity, property: reflection.Property): hc.Base | null {
		return this.useDirectPropertyAccess ? property.getDirectUnsafe(entity) : property.get(entity);
	}

	private _absenceInfoTypeInfo?: EntityTypeInfo;

	private absenceInfoTypeInfo(): EntityTypeInfo {
		if (!this._absenceInfoTypeInfo)
			this._absenceInfoTypeInfo = this.acquireEntityTypeInfo(AbsenceInformation);

		return this._absenceInfoTypeInfo;
	}

	private register(entity: GenericEntity): number {
        let num = this.idByEntities.get(entity);

        if (num === undefined) {
			if (this.entityVisitor)
				this.entityVisitor(entity);

			num = this.idSequence++;
            this.idByEntities.set(entity, num);
        }

        return num;
	}

	private lookupId(entity: GenericEntity): number | undefined {
		return this.idByEntities.get(entity);
	}
}
