// @ts-check

import { MyORMInternalError, MyORMSyntaxError } from './exceptions.js';
import * as Types from './types.js';
import { DEFAULT_ESCAPE_CHARACTER__END, DEFAULT_ESCAPE_CHARACTER__START } from './util.js';

/** @typedef {{[key: string]: any}} AbstractModel */

/**
 * Initializes the first parts of a WhereBuilder given the column name and table name.
 * @template {AbstractModel} TTableModel
 * @template {keyof TOriginalModel} TColumn
 * @template {AbstractModel} [TOriginalModel=TTableModel]
 * @param {TColumn} column
 * @param {string} table
 * @param {Types.Chains} chain
 * @param {any} relationships
 * @param {Types.AdapterOptions=} options
 * @returns {WhereBuilder<TTableModel, TColumn, TOriginalModel>}
 */
export function Where(column, table, relationships, options={}, chain="WHERE") {
    options = { 
        escapeCharStart: DEFAULT_ESCAPE_CHARACTER__START, 
        escapeCharEnd: DEFAULT_ESCAPE_CHARACTER__END,
        ...options
    };
    return new WhereBuilder(column, table, relationships, options, chain);
}

/**
 * Assists in building a WHERE clause.
 * @template {AbstractModel} TTableModel Table model that the WHERE clause is being built for.
 * @template {keyof TOriginalModel} TColumn Initial column type for when the WhereBuilder is created.
 * @template {AbstractModel} [TOriginalModel=TTableModel] Used to keep track of the original model when nesting conditions.
 */
export class WhereBuilder {
    /** @private @type {Types.RecursiveArray<Types.ConditionConfig<TOriginalModel>>} */ _conditions; // not marked with # because it needs access to other objects from within.
    /** @type {string} */ #table;
    /** @type {Types.ConditionConfig<TOriginalModel>} */ #current;
    /** @type {any} */ #relationships;
    /** @type {boolean} */ #negated;
    /** @type {Types.AdapterOptions} */ #options
    

    /**
     * @param {keyof TOriginalModel} column 
     * @param {string} table
     * @param {any} relationships
     * @param {Types.AdapterOptions=} options
     * @param {Types.Chains} chain
     */
    constructor(column, table, relationships, options={}, chain="WHERE") {
        options = {
            escapeCharStart: DEFAULT_ESCAPE_CHARACTER__START,
            escapeCharEnd: DEFAULT_ESCAPE_CHARACTER__END,
            ...options
        };
        // @ts-ignore
        this.#current = { chain, property: `${table}.${options.escapeCharStart}${column}${options.escapeCharEnd}` }
        this.#table = table;
        this.#relationships = relationships;
        this.#options = options;
        this._conditions = [];
        this.#negated = false;
    }

    // Public functions

    /**
     * Negate the next condition called.
     * @returns {this}
     */
    not() {
        this.#current.chain += " NOT";
        this.#negated = true;
        return this;
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    equals(value) {
        this.#current.value = value;
        this.#current.operator = "=";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is not equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    notEquals(value) {
        this.#current.value = value;
        this.#current.operator = "<>";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    lessThan(value) {
        this.#current.value = value;
        this.#current.operator = "<";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than or equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    lessThanOrEqualTo(value) {
        this.#current.value = value;
        this.#current.operator = "<=";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is greater than the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    greaterThan(value) {
        this.#current.value = value;
        this.#current.operator = ">";
        this.#insert();
        return this.#chain();
    }

    /** 
     * Adds a condition to the WHERE clause where if the specified column is greater than or equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    greaterThanOrEqualTo(value) {
        this.#current.value = value;
        this.#current.operator = ">=";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column contains any of the values specified.
     * @param {TOriginalModel[TColumn][]} values
     * Array of values to check if the column equals any of.
     * @returns {Types.Chain<TOriginalModel>} 
     * A group of methods for optional chaining of conditions.
     */
    in(values) {
        this.#current.value = values;
        this.#current.operator = "IN";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column, as a string, is like, by SQL's LIKE command syntax, the value specified.
     * This operation is case insensitive.
     * @param {string} value
     * String value to check where the column is like.
     * @returns {Types.Chain<TOriginalModel>} 
     * A group of methods for optional chaining of conditions.
     */
    like(value) {
        this.#current.value = value;
        this.#current.operator = "LIKE";
        this.#insert();
        return this.#chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column, as a string, contains the value specified.
     * This operation is case insensitive.
     * @param {string} value
     * String value to check where the column contains.
     * @returns {Types.Chain<TOriginalModel>} 
     * A group of methods for optional chaining of conditions.
     */
    contains(value) {
        this.#current.value = `%${value}%`;
        this.#current.operator = "LIKE";
        this.#insert();
        return this.#chain();
    }

    /**
     * Returns the built WHERE command. (sanitized)
     * @param {string} table 
     * Table to grab the conditions of. (default: "", or all conditions across all tables)
     * @param {number=} paramStart
     * Parameter index to where the WHERE string wlll start from.
     * @returns {string} 
     * WHERE clause string used in the SQL command.
     */
    toString(table="", paramStart=0) {
        let conditionsClone = JSON.parse(JSON.stringify(this._conditions));
        const cmd = toStringRecursive(this._conditions, table, this.#options.useNumberedParameters, 0, paramStart);
        this._conditions = conditionsClone;
        return cmd;
    }

    /**
     * Returns an array of the value arguments to be passed in with the query with sanitization.
     * @param {string} table 
     * Table to grab the conditions of. (default: "", or all conditions across all tables)
     * @returns {(string|number|boolean|Date)[]}
     * Array of all arguments that were used in the WHERE clause.
     */
    getArgs(table="") {
        return flatten(this._conditions).filter(c => c.property.includes(table)).flatMap(c => c.value === undefined ? null : c.value);
    }

    // Private functions

    /**
     * Chains a ConditionConfig
     * @returns {Types.Chain<TOriginalModel>}
     */
    #chain() {
        return new Proxy({
            and: (modelCallback) => {
                const newProxy = (table=this.#table) => new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (p in this.#relationships) {
                            return newProxy(this.#relationships[p].alias);
                        }
                        return Where(String(p), table, this.#relationships, this.#options, "AND");
                    }
                });
                const wb = modelCallback(newProxy(this.#table));
                // @ts-ignore ._conditions is private, and since this is in a lambda function, ts thinks we aren't in the WhereBuilder class.
                this._conditions = [...this._conditions, wb._conditions];
                return this.#chain();
            },
            or: (modelCallback) => {
                const newProxy = (table=this.#table) => new Proxy(/** @type {any} */ ({}), {
                    get: (t,p,r) => {
                        if(p in this.#relationships) {
                            return newProxy(this.#relationships[p].alias);
                        }
                        return Where(String(p), table, this.#relationships, this.#options, "OR");
                    }
                });
                const wb = modelCallback(newProxy());
                // @ts-ignore ._conditions is private, and since this is in a lambda function, ts thinks we aren't in the WhereBuilder class.
                this._conditions = [...this._conditions, wb._conditions];
                return this.#chain();
            }
        }, {
            get: (t, p, r) => {
                if(String(p) === "_conditions") {
                    return this._conditions;
                }
                if (String(p) !== "and" && String(p) !== "or") {
                    throw new MyORMSyntaxError(`You can only chain WHERE conditions with 'AND' or 'OR'. ("${String(p)}")`);
                }
                return t[p];
            }
        });
    }

    /**
     * Inserts the object, if it has all of the required properties to build a WHERE conditional.
     */
    #insert() {
        if ("chain" in this.#current
            && "property" in this.#current
            && "value" in this.#current
            && "operator" in this.#current) {
            if(this.#current.value == null) {
                if (this.#current.operator == "=") {
                    this.#current.operator = "IS";
                }
                if(this.#current.operator == "<>") {
                    this.#current.operator = "IS NOT";
                }
            }
            if(this.#negated) {
                if(this._conditions.length <= 0) {
                    this._conditions = [...this._conditions, []];
                }
                //@ts-ignore
                this._conditions[0] = [...this._conditions[0], this.#current];
            } else {
                this._conditions = [...this._conditions, this.#current];
            }
            // @ts-ignore We don't care that the properties don't exist. They will be filled in, we just don't want the old values.
            this.#current = {};
        } else {
            throw Error('Something went wrong when building the WHERE clause. If you see this, report it as an issue.');
        }
    }

    // Synonyms

    /**
     * Synonym of `.equals()`.
     * @type {Types.Condition<TOriginalModel, TColumn>}
     */
    eq = this.equals;
    /**
     * Synonym of `.notEquals()`.
     * @type {Types.Condition<TOriginalModel, TColumn>}
     */
    neq = this.notEquals;
    /**
     * Synonym of `.lessThan()`.
     * @type {Types.Condition<TOriginalModel, TColumn>}
     */
    lt = this.lessThan;
    /**
     * Synonym of `.lessThanOrEqualTo()`.
     * @type {Types.Condition<TOriginalModel, TColumn>}
     */
    lteq = this.lessThanOrEqualTo;
    /**
     * Synonym of `.greaterThan()`.
     * @type {Types.Condition<TOriginalModel, TColumn>}
     */
    gt = this.greaterThan;
    /**
     * Synonym of `.greaterThanOrEqualTo()`.
     * @type {Types.Condition<TOriginalModel, TColumn>}
     */
    gteq = this.greaterThanOrEqualTo;
}

/**
 * Recursively flattens a recursively nested array into a single array. This is used to get the arguments for passing into a connection.
 * @param {any[]} items 
 * Items to flatten.
 * @returns 
 */
function flatten(items) {
    const flat = [];

    items.forEach(item => {
        if (Array.isArray(item)) {
            flat.push(...flatten(item));
        } else {
            flat.push(item);
        }
    });

    return flat;
}

/**
 * Recursively builds a complete "WHERE" conditional string. This is used to get the full clause.
 * @template {AbstractModel} TTableModel
 * @param {Types.ConditionConfig<TTableModel>|Types.RecursiveArray<Types.ConditionConfig<TTableModel>>} conditions 
 * Recursively nested array of conditions.
 * @param {string} table 
 * Table to grab the conditions of. If a table is specified, then only conditions of that table are grabbed.  
 * @param {boolean?} useNumberedParameters
 * True if the sanitized values should be in the format as $1, $2, etc.
 * @param {number} x
 * Depth of the recursion.
 * @returns {string}
 * Fully interpolated string derived from `conditions`.
 */
function toStringRecursive(conditions, table, useNumberedParameters, x=0, parameterIndex=0) {
    if (conditions === undefined) return "";
    const sanitizedParameter = useNumberedParameters ? (n) => `@arg${n}` : () => `?`;
    
    // If not an array, then just return the serialized string.
    if (!Array.isArray(conditions)) {
        console.log(String(conditions.property));
        if (String(conditions.property).includes(table)) {
            return `\n${Array.from(Array(x + 1 + (conditions.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${conditions.chain} ${String(conditions.property)} ${conditions.operator} ${Array.isArray(conditions.value) ? `(${conditions.value.map((_, n) => sanitizedParameter(parameterIndex++)).join(',')})` : sanitizedParameter(x)}`;
        }
        return "";
    }

    // If it is an array, loop through
    let s = "";
    for (const conds of conditions) {
        // if the iterated element is not an array, then just return the serialized string.
        if (!Array.isArray(conds)) {
            console.log(String(conds.property), table);
            if (String(conds.property).includes(table)) {
                s += `\n${Array.from(Array(x + 1 + (conds.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${conds.chain} ${String(conds.property)} ${conds.operator} ${Array.isArray(conds.value) ? `(${conds.value.map((_,n) => sanitizedParameter(parameterIndex++)).join(',')})` : sanitizedParameter(parameterIndex++)}`;
            }
        } else {
            const cond = conds.shift();
            if (cond === undefined) throw new MyORMInternalError();
            // if the length of the array is > 1...
            if (conds.length > 0) {
                // shift the element out to serialize it into the string and also recursively call this function with the remainder of `conds`.
                // @ts-ignore ignoring because recursive types are strange.
                if (String(cond.property).includes(table)) {
                    // @ts-ignore ignoring because recursive types are strange.
                    s += `\n${Array.from(Array(x + 1 + (cond.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${cond.chain} (${cond.property} ${cond.operator} ${Array.isArray(cond.value) ? `(${cond.value.map((_, n) => sanitizedParameter(parameterIndex++)).join(',')})` : sanitizedParameter(parameterIndex++)}${toStringRecursive(conds, table, useNumberedParameters, x + 1, parameterIndex)})`;
                }
            }
            else {
                s += toStringRecursive(cond, table, useNumberedParameters, x, parameterIndex);
            }
        }
    }
    return s;
}
