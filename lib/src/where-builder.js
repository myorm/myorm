// @ts-check

import { MyORMInternalError, MyORMSyntaxError } from './exceptions.js';
import * as Types from './types.js';

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
 * @returns {WhereBuilder<TTableModel, TColumn, TOriginalModel>}
 */
export function Where(column, table, relationships, chain="WHERE") {
    return new WhereBuilder(column, table, relationships, chain);
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
     * @param {Types.Chains} chain
     */
    constructor(column, table, relationships, chain="WHERE") {
        // @ts-ignore
        this.#current = { chain, property: column, table }
        this.#table = table;
        this.#relationships = relationships;
        this.#negated = chain.endsWith('NOT');
        this._conditions = [];
    }

    // Public functions

    /**
     * Negate the next condition called.
     * @returns {this}
     */
    get not() {
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

    // Private functions

    /**
     * @private
     * @returns {import('./types.js').WhereClausePropertyArray}
     */
    _getConditions() {
        return this._conditions;
    }

    /**
     * @private
     * @param {keyof TOriginalModel} column
     * @param {Types.Chains} chain
     * @returns {this}
     */
    _append(column, chain="WHERE") {
        // @ts-ignore
        this.#current = { chain, property: `${table}.${column}` }
        this.#negated = chain.endsWith('NOT');
        return this;
    }

    /**
     * Chains a ConditionConfig
     * @returns {Types.Chain<TOriginalModel>}
     */
    #chain() {
        return new Proxy({
            and: (modelCallback) => {
                const newProxy = (table=this.#table, relationships=this.#relationships) => new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (p in relationships) {
                            return newProxy(relationships[p].alias, relationships[p].relationships);
                        }
                        return Where(String(p), table, this.#relationships, "AND");
                    }
                });
                const wb = modelCallback(newProxy(this.#table));
                // @ts-ignore ._conditions is private, and since this is in a lambda function, ts thinks we aren't in the WhereBuilder class.
                this._conditions = [...this._conditions, wb._conditions];
                return this.#chain();
            },
            or: (modelCallback) => {
                const newProxy = (table=this.#table, relationships=this.#relationships) => new Proxy(/** @type {any} */ ({}), {
                    get: (t,p,r) => {
                        if (p in relationships) {
                            return newProxy(relationships[p].alias, relationships[p].relationships);
                        }
                        return Where(String(p), table, this.#relationships, "OR");
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
            && "operator" in this.#current
            && "table" in this.#current) {
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