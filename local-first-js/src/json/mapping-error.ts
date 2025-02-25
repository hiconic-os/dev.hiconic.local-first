
import { Reason } from "@dev.hiconic/gm_reason-model";

export class MappingError extends Error {
	readonly reason: Reason;
	
	constructor(reason: Reason, cause?: MappingError) {
		super(reason.text!);
		this.reason = reason;

		if (cause)
			reason.reasons.push(cause.getReason());
	}
	
	getReason(): Reason {
		return this.reason;
	}
}
