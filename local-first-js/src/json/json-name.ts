import { reflection } from "@dev.hiconic/tf.js_hc-js-api";
import { AbstractJsonScalarValue } from "./abstract-json-scalar-value.js";
import { ConversionContext } from "./conversion-context.js";
import { JsonLocation } from "./json-location.js";

export class JsonName extends AbstractJsonScalarValue {
	private value: string;
	
	constructor(conversionContext: ConversionContext, name: string, start: JsonLocation, end: JsonLocation) {
		super(conversionContext, start, end);
		this.value = name;
	}
	
	getType(): reflection.GenericModelType {
		return reflection.STRING;
	}
	
	getValue(): string {
		return this.value;
	}
	
	isString(): boolean {
		return true;
	}
	
	asString(): string {
		return this.value;
	}
}
