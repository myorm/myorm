//@ts-check

const MyORMGithubURL = `https://github.com/myorm/myorm`;

export class MyORMAdapterError extends Error {
    constructor(message) {
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

export class MyORMInternalError extends Error {
    constructor() {
        super(`An internal error has occurred. Please submit this as an issue on GitHub. (${MyORMGithubURL})`);
        this.name = 'MyORMInternalError';
    }
}

export class MyORMInvalidArgumentError extends Error {
    constructor(arg) {
        super(`The argument, ${arg}, is an invalid argument.`);
        this.name = 'MyORMInvalidArgumentError';
    }
}

export class MyORMInvalidPropertyTypeError extends Error {
    /**
     * 
     * @param {any} arg 
     * @param {"string"|"number"} expectedType 
     */
    constructor(arg, expectedType="string") {
        super(`The property reference, ${String(arg)}, is of an invalid accessor type. (expected: ${expectedType}, actual: ${typeof arg})`);
        this.name = 'MyORMInvalidPropertyTypeError';
    }
}

export class MyORMColumnDoesNotExistError extends Error {
    constructor(col, table) {
        super(`The property, "${col}", does not exist as a column on the table, "${table}".`);
        this.name = 'MyORMColumnDoesNotExistError';
    }
}

export class MyORMConstraintError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MyORMConstraintError';
    }
}

export class MyORMNotImplementedError extends Error {
    constructor(message) {
        super(message);
        this.name = `MyORMNotImplementedError`;
    }
}

export class MyORMNonUniqueKeyError extends Error {
    constructor() {
        super(`An attempt to insert a duplicate key has occurred.`);
        this.name = `MyORMNonUniqueKeyError`;
    }
}