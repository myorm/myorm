//@ts-check

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