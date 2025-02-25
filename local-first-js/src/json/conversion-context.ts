import { GenericEntity } from "@dev.hiconic/gm_root-model"
import { reflection, hc } from "@dev.hiconic/tf.js_hc-js-api";
import { IdentityManagementMode } from "./identity-management-mode.js";
import { SpecialField } from "./special-field.js";

export type PropertySupplier = (type: reflection.EntityType<GenericEntity>, property: string) => reflection.Property;
export type PropertTypeInference = (type: reflection.EntityType<GenericEntity>, property: reflection.Property) => reflection.GenericModelType;
export type IdTypeSupplier = (name: string) =>reflection.GenericModelType;

export interface ConversionContext {
	parseDate(dataAsString: string): Date;
	resolveReference(ref: string): GenericEntity | undefined;
	createEntity(entityType: reflection.EntityType<GenericEntity>): GenericEntity;
	registerEntityByReference(entity: GenericEntity, id: string): boolean;
	getPropertySupplier(): PropertySupplier | undefined;
	getPropertyTypeInferenceOverride(): PropertTypeInference | undefined;
	isPropertyLenient(): boolean;
	snakeCaseProperties(): boolean;
	idTypeSupplier(): IdTypeSupplier | undefined;
	identityManagedMode(): IdentityManagementMode;
	getTypeSpecificProperties(entityType: reflection.EntityType<GenericEntity>): Map<string, reflection.EntityType<GenericEntity>>;
	getInferredPropertyType(entityType: reflection.EntityType<GenericEntity>, property: reflection.Property): reflection.GenericModelType;
	registerEntityById(entity: GenericEntity, id: hc.Base): void;
	registerEntityByGlobalId(entity: GenericEntity, entityGlobalId: string): void;
	resolveEntityById(concreteType: reflection.EntityType<GenericEntity>, entityId: hc.Base): GenericEntity | undefined;
	resolveEntityByGlobalId(entityGlobalId: string): GenericEntity | undefined;
	detectSpecialField(n: string): SpecialField | undefined;
}
