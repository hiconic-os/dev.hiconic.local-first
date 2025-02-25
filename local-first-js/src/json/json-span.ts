import { JsonLocation } from "./json-location.js";

export class JsonSpan {
	readonly start: JsonLocation; 
	readonly end: JsonLocation;
	
	
	constructor(start: JsonLocation, end: JsonLocation) {
		this.start = start;
		this.end = end;
	}
	
	public toString(): string {
		const loc1 = this.start;
		const loc2 = this.end;
		const l1 = loc1.lineNr;
		const c1 = loc1.columnNr;
		const l2 = loc2.lineNr;
		const c2 = loc2.columnNr;
		
		if (l1 == l2)
			return "(line: " + l1+", pos: "+c1+"-"+c2+")";
		else
			return "(line: " + l1+", pos: "+c1+" to line: " + l2 + ", pos: " + c2 +")";

	}
}