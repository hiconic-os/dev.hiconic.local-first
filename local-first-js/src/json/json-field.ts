import { JsonName } from "./json-name.js";
import { JsonValue } from "./json-value.js";

export class JsonField {
	readonly name: JsonName;
	readonly value: JsonValue;
	readonly property: boolean;
	
	constructor(name: JsonName, value: JsonValue, property: boolean) {
		this.name = name;
		this.value = value;
		this.property = property;
	}
}
