import { hc, reflection } from "@dev.hiconic/tf.js_hc-js-api";
import { ConversionContext } from "./conversion-context.js";
import { JsonComplexValue } from "./json-complex-value.js";
import { JsonLocation } from "./json-location.js";
import { JsonName } from "./json-name.js";
import { JsonValue } from "./json-value.js";

export class JsonRootValue extends JsonComplexValue {
	private value?: JsonValue;

	constructor(context: ConversionContext, inferredType: reflection.GenericModelType, start: JsonLocation) {
		super(context, start);
		this.inferredType = inferredType;
	}
	
	addValue(_name: JsonName, value: JsonValue): void {
		if (this.value != null)
			throw new Error("Unexpected number of root values");
		
		value.inferType(this.inferredType!);
		this.value = value;
	}

	onEnd(): void {
	}

	as(inferredType: reflection.GenericModelType): hc.Base | null {
		return this.value?.as(inferredType) || null;
	}

}
