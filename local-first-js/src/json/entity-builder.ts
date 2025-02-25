
import { AbsenceInformation } from "@dev.hiconic/gm_absence-information-model";
import { InvalidArgument, NotFound } from "@dev.hiconic/gm_essential-reason-model";
import { GenericEntity } from "@dev.hiconic/gm_root-model";
import { hc, reflection } from "@dev.hiconic/tf.js_hc-js-api";
import { ConversionContext } from "./conversion-context.js";
import { ConversionError } from "./conversion-error.js";
import { JsonField } from "./json-field.js";
import { MappingError } from "./mapping-error.js";

export class EntityBuilder {
	private entity: GenericEntity;
	private conversionContext: ConversionContext;
	
	private readonly propertySupplier;
	private readonly idTypeSupplier;
	
	private entityType: reflection.EntityType<GenericEntity>;
	private propertyLenient: boolean;
	private snakeCaseProperties: boolean;
	
	constructor(entity: GenericEntity, conversionContext: ConversionContext) {
		this.entity = entity;
		this.entityType = entity.EntityType();
		this.conversionContext = conversionContext;
		this.propertySupplier = conversionContext.getPropertySupplier();
		this.propertyLenient = conversionContext.isPropertyLenient();
		this.snakeCaseProperties = conversionContext.snakeCaseProperties();
		this.idTypeSupplier = conversionContext.idTypeSupplier();
	}

	protected toCamelCase(value: string, delimiter: string): string {
		let pascalCase = value.split(delimiter).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
		return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
	}
	
	public resolveProperty(name: string): reflection.Property | undefined {
		if (this.snakeCaseProperties) {
			name = this.toCamelCase(name, '_');
		}
		
		return this.propertySupplier? this.propertySupplier(this.entityType, name) : this.entityType.findProperty(name);
	}

	private propertyNotFound(propertyName: string, field: JsonField): MappingError {
		const msg = "Unknown property [" + propertyName + "] within type " + this.entityType.getTypeSignature() + " " + field.name.getSpan();
		const notFound = NotFound.create();
		notFound.text = msg; 
		return new MappingError(notFound);
	}
	
	private propertyValueMismatch(propertyName: string, e: ConversionError, field: JsonField ): MappingError {
		const msg = "Invalid value for property [" + propertyName + "] within type " + this.entityType.getTypeSignature() + " " + field.name.getSpan();
		const invalidArgument = InvalidArgument .create();
		invalidArgument.text = msg;
		invalidArgument.reasons.push(e.getReason());
		return new MappingError(invalidArgument);
	}
	
	public setField(field: JsonField): void {
		const name = field.name.getValue();

		let property: reflection.Property | undefined;
		
		if (name.charAt(0) === '?') {
			const realName = name.substring(1);
			property = this.resolveProperty(realName);
			if (!property) {
				if (this.propertyLenient)
					return;
				
				throw this.propertyNotFound(realName, field);
			}

			try {
				const ai = field.value.as(AbsenceInformation) as AbsenceInformation;
				property.setAbsenceInformation(this.entity, ai);
			}
			catch (e) {
				if (e instanceof ConversionError)
					throw this.propertyValueMismatch(realName, e, field);

				throw e;
			}

		} else {
			property = this.resolveProperty(name);
			if (!property) {
				if (this.propertyLenient)
					return;
				
				throw this.propertyNotFound(name, field);
			}
			
			let propertyType = this.conversionContext.getInferredPropertyType(this.entityType, property);
			
			const jsonValue = field.value;
			
			try {
				if (property.isIdentifier()) {
					if (this.idTypeSupplier) { 
						propertyType = this.idTypeSupplier(this.entityType.getTypeSignature());
					}
					else {
						let id: hc.Base| null = jsonValue.as(reflection.OBJECT);
						
						if (typeof id === "number")
							id = BigInt(id);
						
						property.set(this.entity, id);
						return;
					}
				}
			
				property.set(this.entity, jsonValue.as(propertyType));
			}
			catch (e) {
				if (e instanceof ConversionError)
					throw this.propertyValueMismatch(name, e, field);

				throw e;
			}
		}

	}

}
