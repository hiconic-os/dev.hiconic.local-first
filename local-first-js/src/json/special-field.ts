import { IdentityManagementMode } from "./identity-management-mode.js";

export class SpecialField {

	readonly isProperty: boolean;
	readonly inferredIdentityManagementMode?: IdentityManagementMode;
	readonly name: string;
	
	constructor(name: string, isProperty: boolean, inferredIdentityManagementMode?: IdentityManagementMode) {
		this.isProperty = isProperty;
		this.inferredIdentityManagementMode = inferredIdentityManagementMode;
		this.name = name;
	}
	
	static find(name: string): SpecialField | undefined {
		return SpecialFields[name];
	}
}

export const SpecialFields: { [key: string]: SpecialField } = {
	id: new SpecialField("id", true, IdentityManagementMode.id),
	_id: new SpecialField("_id", false, IdentityManagementMode._id),
	_ref: new SpecialField("_ref", false),
	_type: new SpecialField("_type", false),
	globalId: new SpecialField("globalId", true)
};

