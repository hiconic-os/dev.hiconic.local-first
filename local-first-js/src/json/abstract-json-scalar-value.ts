import { ConversionContext } from "./conversion-context.js";
import { ConversionError } from "./conversion-error.js";
import { JsonLocation } from "./json-location.js";
import { JsonSpan } from "./json-span.js";
import { JsonValue } from "./json-value.js";
import { reflection, hc, T } from "@dev.hiconic/tf.js_hc-js-api";
import { NotFound  } from "@dev.hiconic/gm_essential-reason-model";

export abstract class AbstractJsonScalarValue extends JsonValue {
	
	constructor(conversionContext: ConversionContext, start: JsonLocation, end: JsonLocation) {
		super(conversionContext, start);
		this.end = end;
	}
	
	public abstract getType(): reflection.GenericModelType;
	
	public abstract getValue(): hc.Base;
	
	public abstract isString(): boolean;
	
	public isScalar(): boolean {
		return true;
	}
	
	public getSpan(): JsonSpan {
		return new JsonSpan(this.start, this.end!);
	}
	
	/**
	 * @throws ConversionError
	 */
	public as(inferredType: reflection.GenericModelType): hc.Base | null {
		const value = this.getValue();
		const type = this.getType();
		
		// if null conversion is always possible
		if (value == null)
			return null;
		
		// if type is identical, no conversion is required
		if (inferredType == type)
			return value;
		
		switch (inferredType.getTypeCode()) {
			// type object allows for any value
			case reflection.TypeCode.objectType: return value;

			// allowed conversions
			case reflection.TypeCode.dateType: return this.asDate();
			case reflection.TypeCode.decimalType: return this.asDecimal();
			case reflection.TypeCode.doubleType: return this.asDouble();
			case reflection.TypeCode.floatType: return this.asFloat();
			case reflection.TypeCode.longType: return this.asLong();
			case reflection.TypeCode.enumType: return this.asEnum(this.inferredType as reflection.EnumType<any>);
			
			// no possible alternatives than the actual type
			default: // booleanType | integerType | stringType | entityType | listType | mapType | setType
				throw this.typeMismatchErrorInferred(inferredType);
		}
		return null;
	}
	
	private typeMismatchErrorInferred(inferredType: reflection.GenericModelType): ConversionError {
		return this.typeMismatchError(inferredType, this.getType(), this.getValue());
	}
	
	/**
	 * @throws ConversionError
	 */
	private asDate(): Date {
		const type = this.getType();
		const value = this.getValue();
		
		switch (type.getTypeCode()) {
			case reflection.TypeCode.integerType:
				return new Date(value as number);
			case reflection.TypeCode.longType:
				return new Date(Number(value as bigint));
			case reflection.TypeCode.stringType:
				try {
					return this.conversionContext.parseDate(value as string);
				}
				catch (e) {
					throw this.conversionError(e);
				}
			default:
				throw this.typeMismatchErrorInferred(reflection.DATE);
		}
	}

	/**
	 * @throws ConversionError
	 */
	asLong(): bigint {
		const value = this.getValue();
		
		switch (this.getType().getTypeCode()) {
			case reflection.TypeCode.integerType:
				return BigInt(value as number);
			case reflection.TypeCode.stringType:
				try {
					return BigInt(value as string);
				}
				catch (e) {
					throw this.conversionError(e);
				}
			default:
				throw this.typeMismatchErrorInferred(reflection.LONG);
		}
	}

	/**
	 * @throws ConversionError
	 */
	asFloat(): T.Float {
		switch (this.getType().getTypeCode()) {
			case reflection.TypeCode.integerType:
				return new T.Float(this.getValue() as number);
			case reflection.TypeCode.doubleType:
				return new T.Float((this.getValue() as T.Double).valueOf());
			default:
				throw this.typeMismatchErrorInferred(reflection.FLOAT);
		}
	}

	/**
	 * @throws ConversionError
	 */
	asDouble(): T.Double {
		const value = this.getValue();
		switch (this.getType().getTypeCode()) {
			case reflection.TypeCode.longType:
				return new T.Double(Number(value as bigint));
			case reflection.TypeCode.floatType:
				return new T.Double((value as T.Float).valueOf());
			case reflection.TypeCode.integerType:
				return new T.Double(value as number);
			default:
				throw this.typeMismatchErrorInferred(reflection.DOUBLE);
		}
	}
	/**
	 * @throws ConversionError
	 */
	asDecimal(): T.Decimal {
		const value = this.getValue();
		switch (this.getType().getTypeCode()) {
			case reflection.TypeCode.longType:
				// TODO: better conversion here please
				return T.Decimal.fromString((value as bigint).toString());
			case reflection.TypeCode.integerType:
				return T.Decimal.valueOfDouble(value as number);
			case reflection.TypeCode.floatType:
				return T.Decimal.valueOfDouble((value as T.Float).valueOf());
			case reflection.TypeCode.doubleType:
				return T.Decimal.valueOfDouble((value as T.Double).valueOf());
			case reflection.TypeCode.stringType:
				try {
					return T.Decimal.fromString(value as string);
				}
				catch (e) {
					throw this.conversionError(e);
				}
			default:
				throw this.typeMismatchErrorInferred(reflection.DECIMAL);
		}
	}

	/**
	 * @throws ConversionError
	 */
	asEnum(enumType: reflection.EnumType<any>): hc.Enum<any> {
		const constantName = this.asString();
		
		const enumValue: hc.Enum<any> = enumType.findConstant(constantName);
		
		if (enumValue != null)
			return enumValue;

		const msg = "Unknown enum constant [" + constantName + "] in enum type " + enumType.getTypeSignature() + " " + this.getSpan();
		const notFound = NotFound.create();
		notFound.text = msg;
		
		throw new ConversionError(notFound);
	}
}
