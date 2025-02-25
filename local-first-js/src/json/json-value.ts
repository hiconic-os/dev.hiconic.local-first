import { reflection, hc } from "@dev.hiconic/tf.js_hc-js-api";

import GenericModelType = reflection.GenericModelType;
import { JsonLocation } from "./json-location.js";
import { JsonSpan } from "./json-span.js";
import { InvalidArgument } from "@dev.hiconic/gm_essential-reason-model";
import { ConversionError } from "./conversion-error.js";
import { ConversionContext } from "./conversion-context.js";
type Base = hc.Base;


// import com.braintribe.gm.model.reason.Reasons;
// import com.braintribe.gm.model.reason.essential.InvalidArgument;
// import com.braintribe.model.generic.reflection.EssentialTypes;
// import com.braintribe.model.generic.reflection.GenericModelType;
// import com.braintribe.utils.StringTools;
// import com.fasterxml.jackson.core.JsonLocation;

export abstract class JsonValue {
	start: JsonLocation;
	end?: JsonLocation;
	protected inferredType?: GenericModelType;
	protected conversionContext: ConversionContext;
	
	constructor(context: ConversionContext, start: JsonLocation ) {
		this.start = start;
		this.conversionContext = context;
	}
	
	public inferType(type: GenericModelType): void {
		this.inferredType = type;
	}
	
	public isString(): boolean {
		return false;
	}
	
	public isScalar(): boolean {
		return false;
	}
	
	/**
	 * @throws ConversionError
	 */
	public abstract as(inferredType: reflection.GenericModelType): Base | null;
	
	/**
	 * @throws ConversionError
	 */
	asString(): string {
		return this.as(reflection.STRING) as string;
	}
	
	getStart(): JsonLocation {
		return this.start;
	}
	
	getErrorLocation(): string {
		if (this.end != null) {
			return new JsonSpan(this.start, this.end).toString();
		}
		
		return this.start.toString();
	}
	
	protected typeMismatchError(expectedType: GenericModelType, actualType: GenericModelType, value?: Base): ConversionError {
		let msg: string;

		if (value) {
			const safeValue = truncateString(value.toString(), 20);
			msg = "Cannot convert value [" + safeValue + "] of type [" + actualType.getTypeSignature() + "] to type [" + expectedType.getTypeSignature() + "] " + this.getErrorLocation(); 
		}
		else
			msg = "Cannot convert type [" + actualType.getTypeSignature() + "] to type [" + expectedType.getTypeSignature() + "] " + this.getErrorLocation(); 

		const invalidArgument = InvalidArgument.create();
		invalidArgument.text = msg;
		return new ConversionError(invalidArgument);
	}
	
	protected conversionError(e: any): ConversionError  {
		const msg = (e.message || "") + " " + this.getErrorLocation(); 
		const invalidArgument = InvalidArgument.create();
		invalidArgument.text = msg;
		return new ConversionError(invalidArgument);
	}
}

function truncateString(str: string, maxChars: number): string {
    if (str.length <= maxChars) {
        return str;
    }
    const remainingChars = str.length - maxChars;
    return str.substring(0, maxChars) + ` (${remainingChars} chars remaining)`;
}


