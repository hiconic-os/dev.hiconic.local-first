import {Reason} from "@dev.hiconic/gm_reason-model"

export class ConversionError extends Error {
	private reason: Reason;
	
	constructor(reason: Reason, cause?: ConversionError) {
		super(reason.text || "");
		this.reason = reason;

		if (cause) 
			reason.reasons.push(cause.getReason());
	}
	
	getReason(): Reason {
		return this.reason;
	}
}
