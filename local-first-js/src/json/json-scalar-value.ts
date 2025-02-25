import { hc, reflection } from "@dev.hiconic/tf.js_hc-js-api";
import { AbstractJsonScalarValue } from "./abstract-json-scalar-value.js";
import { ConversionContext } from "./conversion-context.js";
import { JsonLocation } from "./json-location.js";

export class JsonScalarValue extends AbstractJsonScalarValue {
	private readonly type: reflection.ScalarType;
	private readonly value: hc.Scalar;
	
	constructor(conversionContext: ConversionContext, type: reflection.ScalarType, value: hc.Scalar, start: JsonLocation, end: JsonLocation) {
		super(conversionContext, start, end);
		this.type = type;
		this.value = value;
		this.end = end;
	}
	
	
	getType(): reflection.ScalarType {
		return this.type;
	}
	
	getValue(): hc.Scalar {
		return this.value;
	}
	
	isString(): boolean {
		return this.type == reflection.STRING;
	}
}
