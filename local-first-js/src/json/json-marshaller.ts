import { ParseError } from '@dev.hiconic/gm_essential-reason-model';
import { GenericEntity } from "@dev.hiconic/gm_root-model";
import { hc, reflection, T } from '@dev.hiconic/tf.js_hc-js-api';
import clarinet, { ClarinetParser } from 'clarinet';
import { ConversionContext, IdTypeSupplier, PropertTypeInference, PropertySupplier } from './conversion-context.js';
import { ConversionError } from './conversion-error.js';
import { IdentityManagementMode } from './identity-management-mode.js';
import { JsonArrayValue } from './json-array-value.js';
import { JsonComplexValue } from './json-complex-value.js';
import { JsonLocation } from './json-location.js';
import { JsonName } from './json-name.js';
import { JsonObjectValue } from './json-object-value.js';
import { JsonRootValue } from './json-root-value.js';
import { JsonScalarValue } from './json-scalar-value.js';
import { JsonValue } from './json-value.js';
import { MappingError } from './mapping-error.js';
import { SpecialField } from './special-field.js';
import { JsonWriter, type MarshallingOptions } from './json-writer.js';

class JsonModelDataMappingException extends Error {}

export type UnmarshallingOptions = {
  inferredRootType?: reflection.GenericModelType;
}

export type { MarshallingOptions }

export class JsonMarshaller {
  async unmarshall<V extends hc.Base>(json: string, options: UnmarshallingOptions = {}): Promise<V | null> {
    const builder = new ClarinetJsonModelBuilder(options.inferredRootType || reflection.OBJECT);
    return builder.parse(json);
  }

  async marshallToString(data: hc.Base | null, options: MarshallingOptions = {}): Promise<string> {
    const writer = new JsonWriter(options);
    return writer.write(data).asString();
  }

  async marshallToBlob(data: hc.Base, options: MarshallingOptions): Promise<Blob> {
    const writer = new JsonWriter(options);
    return writer.write(data).asBlob();
  }
}

// Our builder that mimics the Java code using clarinet events.
class ClarinetJsonModelBuilder implements ConversionContext {
  private parser: ClarinetParser;
  private stack: JsonComplexValue[] = [];
  private currentName: JsonName | null = null;
  private identityManagementMode = IdentityManagementMode.auto;
  private entitiesById = new Map<reflection.EntityType<GenericEntity>, Map<hc.Base, GenericEntity>>();
  private entitiesByRefId = new Map<string, GenericEntity>();
  private entitiesByGlobalId = new Map<string, GenericEntity>();

  constructor(private inferredRootType: reflection.GenericModelType) {
    this.parser = clarinet.parser();

    this.parser.onclosearray
    // Start of JSON document: create a root value.
    // (This emulates: new JsonRootValue(this, inferredRootType, parser.currentLocation()))
    const root = new JsonRootValue(this, this.inferredRootType, this.getCurrentLocation());
    this.push(root);

    // When an object starts, create a new JsonObjectValue and push it.
    this.parser.onopenobject = (key?: string) => {
      // For the very first key in an object, clarinet sends it as parameter.
      this.push(new JsonObjectValue(this, this.getCurrentLocation()));

      if (key)
        this.currentName = new JsonName(this, key, this.getCurrentTokenLocation(), this.getCurrentLocation());
    };

    // When a key is encountered inside an object.
    this.parser.onkey = (key: string) => {
      this.currentName = new JsonName(this, key, this.getCurrentTokenLocation(), this.getCurrentLocation());
    };

    // When an array starts.
    this.parser.onopenarray = () => {
      const arr = new JsonArrayValue(this, this.getCurrentLocation());
      this.push(arr);
    };

    // When a primitive value is encountered.
    // (This handles VALUE_NULL, VALUE_TRUE, VALUE_FALSE, VALUE_STRING, VALUE_NUMBER)
    this.parser.onvalue = (value: any) => {
      this.addScalarValue(value);
    };

    // When an object closes.
    this.parser.oncloseobject = () => {
      this.pop();
    };

    // When an array closes.
    this.parser.onclosearray = () => {
      this.pop();
    };

    // Error handling.
    this.parser.onerror = (err: Error) => {
      throw new JsonModelDataMappingException(`Parsing error: ${err.message}`);
    };
  }

  parseDate(dataAsString: string): Date {
      return new Date(Date.parse(dataAsString));
  }
  
  resolveReference(ref: string): GenericEntity | undefined {
    return this.entitiesByRefId.get(ref);
  }

  createEntity(entityType: reflection.EntityType<GenericEntity>): GenericEntity {
    return entityType.createRaw();
  }

  registerEntityByReference(entity: T.com.braintribe.model.generic.GenericEntity, id: string): boolean {
    if (this.entitiesByRefId.has(id))
      return false;

    this.entitiesByRefId.set(id, entity);
    return true;
  }

  getPropertySupplier(): PropertySupplier | undefined {
    // TODO: make configurable
    return undefined;
  }

  getPropertyTypeInferenceOverride(): PropertTypeInference | undefined {
    // TODO: make configurable
    return undefined;
  }

  isPropertyLenient(): boolean {
    // TODO: make configurable
    return false;
  }
  
  snakeCaseProperties(): boolean {
    // TODO: make configurable
    return false;
  }

  idTypeSupplier(): IdTypeSupplier | undefined {
    // TODO: make configurable
    return undefined;
  }

  identityManagedMode(): IdentityManagementMode {
    return IdentityManagementMode._id;
  }

  private readonly emptySpecificProps = new Map<string, reflection.EntityType<GenericEntity>>();

  getTypeSpecificProperties(_entityType: reflection.EntityType<GenericEntity>): Map<string, reflection.EntityType<GenericEntity>> {
    return this.emptySpecificProps;
  }

  getInferredPropertyType(entityType: reflection.EntityType<GenericEntity>, property: reflection.Property): reflection.GenericModelType {
    const inference = this.getPropertyTypeInferenceOverride();

    if (inference) {
      const type = inference(entityType, property);

      if (type)
        return type;
    }

    return property.getType();
  }

  // private buildTypeSpecificProperties(entityType: reflection.EntityType<GenericEntity>): Map<string, reflection.EntityType<GenericEntity>>  {
	// 	if (cmdResolver == null)
	// 		return Collections.emptyMap();
		
	// 	Set<EntityTypeOracle> subTypeOracles = cmdResolver.getModelOracle().findEntityTypeOracle(entityType).getSubTypes().transitive().onlyInstantiable().asEntityTypeOracles();
		
	// 	Map<String, EntityType<?>> result = new HashMap<>();
		
	// 	for (EntityTypeOracle subTypeOracle: subTypeOracles) {
	// 		EntityType<?> subType = subTypeOracle.asType();
	// 		for (Property property: subType.getProperties()) {
	// 			result.merge(property.getName(), subType, (k,v) -> GenericEntity.T);
	// 		}
	// 	}
		
	// 	// cleanup ambiguous entries detectable by null value
	// 	for (Iterator<Map.Entry<String, EntityType<?>>> it = result.entrySet().iterator(); it.hasNext();) {
	// 		Entry<String, EntityType<?>> entry = it.next();
	// 		EntityType<?> value = entry.getValue();
			
	// 		if (value == GenericEntity.T)
	// 			it.remove();
	// 	}
		
	// 	return result;
	// }

  registerEntityById(entity: GenericEntity, id: hc.Base): void {
    const type = entity.EntityType();
    let typeEntities = this.entitiesById.get(type);

    if (!typeEntities) {
      typeEntities = new Map();
      this.entitiesById.set(type, typeEntities);
    }
    typeEntities.set(id, entity);
  }
  registerEntityByGlobalId(entity: GenericEntity, entityGlobalId: string): void {
    this.entitiesByGlobalId.set(entityGlobalId, entity);
  }
  resolveEntityById(concreteType: reflection.EntityType<T.com.braintribe.model.generic.GenericEntity>, entityId: hc.Base): GenericEntity | undefined {
    return this.entitiesById.get(concreteType)?.get(entityId);
  }

  resolveEntityByGlobalId(entityGlobalId: string): GenericEntity | undefined {
    return this.entitiesByGlobalId.get(entityGlobalId);
  }

  detectSpecialField(n: string): SpecialField | undefined {
		const specialField = SpecialField.find(n);
		
		if (!specialField)
			return undefined;
		
		if (this.identityManagementMode === IdentityManagementMode.auto) {
			const inferredMode = specialField.inferredIdentityManagementMode;
			if (inferredMode)
				this.identityManagementMode = inferredMode;
		}
		
		return specialField;
  }

  private getCurrentTokenLocation(): JsonLocation {
    return this.getCurrentLocation();
  }
  private getCurrentLocation(): JsonLocation {
    return new JsonLocation(this.parser.line!, this.parser.column!)
  }

  // Emulate push operation.
  private push(value: JsonComplexValue): void {
    this.addValue(value);
    this.stack.push(value);
  }

  // Emulate pop operation and attach the completed value to its parent.
  private pop(): JsonComplexValue {
    return this.stack.pop()!;
  }

  private addScalarValue(value: any): void {

    switch (typeof value) {
      case "string":
        this.addValue(new JsonScalarValue(this, reflection.STRING, value, this.getCurrentTokenLocation(), this.getCurrentLocation()));
        break;

      case "boolean":
        this.addValue(new JsonScalarValue(this, reflection.BOOLEAN, value, this.getCurrentTokenLocation(), this.getCurrentLocation()));
        break;

      case "number":
        if (Number.isInteger(value))
          this.addValue(new JsonScalarValue(this, reflection.INTEGER, value, this.getCurrentTokenLocation(), this.getCurrentLocation()));        
        else
          this.addValue(new JsonScalarValue(this, reflection.DOUBLE, new T.Double(value), this.getCurrentTokenLocation(), this.getCurrentLocation()));        
        break;

      case "bigint":
        this.addValue(new JsonScalarValue(this, reflection.LONG, value, this.getCurrentTokenLocation(), this.getCurrentLocation()));        
        break;
    }

	}
	
	private addValue(value: JsonValue): void {
		const peek = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
		if (peek)
			peek.addValue(this.currentName, value);

    this.currentName = null;
	}

  // Public method to process a JSON string (or fragment).
  // This method returns a Promise that resolves with the converted root value.
  public parse<V extends hc.Base>(jsonString: string): Promise<V | null> {
    return new Promise((resolve, reject) => {
      try {
        // Feed the string (or chunk) to clarinet.
        this.parser.write(jsonString);
        this.parser.close();

        // At the end, the root value should be on the stack.
        if (this.stack.length !== 1) {
          return reject(
            new JsonModelDataMappingException("Unexpected state: multiple items remain on the stack.")
          );
        }
        const root = this.pop();
        const result = root.as(this.inferredRootType) as V;
        resolve(result);
      } catch (e: any) {
        if (e instanceof ConversionError) {
          const parseError = ParseError.create();
          parseError.text = "Error while converting json data";
          parseError.reasons.push(e.getReason());
          reject(parseError);
        }
        else if (e instanceof MappingError) {
          const parseError = ParseError.create();
          parseError.text = "Error while mapping json to modeled data";
          parseError.reasons.push(e.getReason());
          reject(parseError);
        }
        else {
          const line: number = e.line || this.parser.line;
          const column: number = e.column || e.column;
          const location = new JsonLocation(line, column);
          const originalMsg = e.message || "Error while parsing"
          const msg = originalMsg + " " + location.toString();
          const parseError = ParseError.create();
          parseError.text = msg;
          reject(parseError);
        }
      }
    });
  }

  
}