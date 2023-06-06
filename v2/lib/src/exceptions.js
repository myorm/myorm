//@ts-check

const MyORMGithubURL = `https://github.com/myorm/myorm`;

export const AdapterErrorTypes = {
    SERIALIZATION_ERR: /** @type {'SERIALIZATION_ERR'} */ ('SERIALIZATION_ERR'),
    QUERY_ERR: /** @type {'QUERY_ERR'} */ ('QUERY_ERR'),
    INSERT_ERR: /** @type {'INSERT_ERR'} */ ('INSERT_ERR'),
    DELETE_ERR: /** @type {'DELETE_ERR'} */ ('DELETE_ERR'),
    UPDATE_ERR: /** @type {'UPDATE_ERR'} */ ('UPDATE_ERR'),
    DESCRIBE_ERR: /** @type {'DESCRIBE_ERR'} */ ('DESCRIBE_ERR')
}

/**
 * @template T
 * @typedef {keyof {[K in keyof T as K & string]: null}} Enum
 */

/** @typedef {Enum<typeof AdapterErrorTypes>} AdapterErrorType */

/**
 * 
 */
export class MyORMAdapterError extends Error {
    /**
     * 
     * @param {(AdapterErrorType|'EVENT_HANDLING_DISABLED'|'TRUNCATION_DISABLED'|'UPDATE_ALL_DISABLED')?} type 
     */
    constructor(type=null) {
        let message;
        switch(type) {
            case AdapterErrorTypes.DELETE_ERR: message = `An error has occurred within the adapter when deleting record(s).`; break;
            case AdapterErrorTypes.DESCRIBE_ERR: message = `An error has occurred within the adapter when describing the table.`; break;
            case AdapterErrorTypes.INSERT_ERR: message = `An error has occurred within the adapter when inserting record(s).`; break;
            case AdapterErrorTypes.SERIALIZATION_ERR: message = `An error has occurred within the adapter when serializing the command.`; break;
            case AdapterErrorTypes.QUERY_ERR: message = `An error has occurred within the adapter when querying records.`; break;
            case AdapterErrorTypes.UPDATE_ERR: message = `An error has occurred within the adapter when updating record(s).`; break;
            case 'EVENT_HANDLING_DISABLED': message = `Event handling has been disabled by the chosen adapter.`; break;
            default: message = `An unknown error has occurred within the adapter.`
        }
        super(message);
        this.name = `MyORMAdapterError`;
    }
}

export class MyORMOptionsError extends Error {
    constructor(message) {
        super(message);
        this.name = `MyORMOptionsError`;
    }
}

export class MyORMQueryError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MyORMQueryError";
        this.originalError = originalError;
    }
}

export class MyORMInsertError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MyORMInsertError";
        this.originalError = originalError;
    }
}

export class MyORMUpdateError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MyORMUpdateError";
        this.originalError = originalError;
    }
}

export class MyORMDeleteError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MyORMDeleteError";
        this.originalError = originalError;
    }
}

export class MyORMSyntaxError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     */
    constructor(message) {
        super(message);
        this.name = "MyORMSyntaxError";
    }
}

export class MyORMArgumentError extends Error {

}

export const RelationshipErrorTypes = {
    NOT_CONFIGURED: /** @type {'NOT_CONFIGURED'} */ ('NOT_CONFIGURED'),
    CONFIGURED_BUT_NOT_INCLUDED: /** @type {'CONFIGURED_BUT_NOT_INCLUDED'} */ ('CONFIGURED_BUT_NOT_INCLUDED'),
}

/** @typedef {Enum<typeof RelationshipErrorTypes>} RelationshipErrorType */

export class MyORMRelationshipError extends Error {
    /**
     * 
     * @param {RelationshipErrorType} type 
     * @param {string?} table
     */
    constructor(type, table=null) {
        let message;
        switch(type) {
            case RelationshipErrorTypes.NOT_CONFIGURED: message = `'${table}' has not been configured as a relationship (Configure relationships using .hasOne() or .hasMany()).`; break;
            case RelationshipErrorTypes.CONFIGURED_BUT_NOT_INCLUDED: message = `'${table}' was configured, but has not been included. (Include relationships using .include()).`; break;
            default: message = `An unknown error occurred when working with relationships.`;
        }
        super(message);
        this.name = 'MyORMRelationshipError';
    }
}

export class MyORMInternalError extends Error {
    constructor() {
        super(`An internal error has occurred. Please submit this as an issue on GitHub. (${MyORMGithubURL})`);
        this.name = 'MyORMInternalError';
    }
}