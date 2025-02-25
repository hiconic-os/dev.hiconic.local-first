export enum IdentityManagementMode {
    /**
     * No identity management done at all. 
     */
    off,

    /**
     * Depending on the parsed assembly the marshaler automatically detects the identification information and uses it for identity management.
     */
    auto,

    /**
     * The internal generated _id information will be used if available. 
     */
    _id,

    /**
     * The id property will be used if available. 
     */
    id
}