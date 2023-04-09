//@ts-check

export class MySqlContextQueryError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MySqlContextQueryError";
        this.originalError = originalError;
    }
}

export class MySqlContextInsertError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MySqlContextInsertError";
        this.originalError = originalError;
    }
}

export class MySqlContextUpdateError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MySqlContextUpdateError";
        this.originalError = originalError;
    }
}

export class MySqlContextDeleteError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     * @param {Error} originalError 
     */
    constructor(message, originalError) {
        super(message);
        this.name = "MySqlContextDeleteError";
        this.originalError = originalError;
    }
}

export class MySqlContextSyntaxError extends Error {
    /** @type {Error} */ originalError;
    /**
     * @param {string} message 
     */
    constructor(message) {
        super(message);
        this.name = "MySqlContextSyntaxError";
    }
}