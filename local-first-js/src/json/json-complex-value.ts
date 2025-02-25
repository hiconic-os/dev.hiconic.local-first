import { ConversionContext } from "./conversion-context.js";
import { JsonLocation } from "./json-location.js";
import { JsonName } from "./json-name.js";
import { JsonValue } from "./json-value.js";

export abstract class JsonComplexValue extends JsonValue {
	constructor(context: ConversionContext, start: JsonLocation) {
		super(context, start);
	}
	/**
	 * 
	 * @param name is only non-null in case of object parsing and not in case of array parse
	 * @param value
	 */
	abstract addValue(name: JsonName | null, value: JsonValue): void;
	
	abstract onEnd(): void;
}
