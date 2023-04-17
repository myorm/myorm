// @ts-check

import { MySqlContextSyntaxError } from './exceptions.js';

/** @typedef {{[key: string]: any}} AbstractModel */

/**
 * Initializes the first parts of a WhereBuilder given the column name and table name.
 * @template {AbstractModel} TTableModel
 * @template {keyof TTableModel} TColumn
 * @param {TColumn} column
 * @param {string} table
 * @param {"WHERE"|"AND"|"OR"} chain
 * @returns {WhereBuilder<TTableModel, TColumn>}
 */
export function Where(column, table, chain="WHERE") {
    return new WhereBuilder(column, table, chain);
}

/**
 * Assists in building a WHERE clause.
 * @template {AbstractModel} TTableModel Table model that the WHERE clause is being built for.
 * @template {keyof TTableModel} TColumn Initial column type for when the WhereBuilder is created.
 */
export class WhereBuilder {
    /** @private @type {RecursiveArray<ConditionConfig<TTableModel>>} */ _conditions;
    /** @private @type {string} */ _table;
    /** @private @type {ConditionConfig<TTableModel>} */ _current;
    /** @private @type {number} */ _depth;
    /** @private @type {boolean} */ _nesting;

    /**
     * 
     * @param {keyof TTableModel} column 
     * @param {string} table
     * @param {"WHERE"|"AND"|"OR"} chain
     */
    constructor(column, table, chain="WHERE") {
        // @ts-ignore
        this._current = { depth: 0, chain, property: `\`${table}\`.\`${column}\`` }
        this._table = table;
        this._conditions = [];
    }

    // Public functions

    /**
     * Adds a condition to the WHERE clause where if the specified column is equal to the value specified.
     * @type {Condition<TTableModel, TColumn>} 
     */
    equals(value) {
        this._current.value = value;
        this._current.operator = "=";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is not equal to the value specified.
     * @type {Condition<TTableModel, TColumn>} 
     */
    notEquals(value) {
        this._current.value = value;
        this._current.operator = "<>";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than the value specified.
     * @type {Condition<TTableModel, TColumn>} 
     */
    lessThan(value) {
        this._current.value = value;
        this._current.operator = "<";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than or equal to the value specified.
     * @type {Condition<TTableModel, TColumn>} 
     */
    lessThanOrEqualTo(value) {
        this._current.value = value;
        this._current.operator = "<=";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is greater than the value specified.
     * @type {Condition<TTableModel, TColumn>} 
     */
    greaterThan(value) {
        this._current.value = value;
        this._current.operator = ">";
        this._insert();
        return this._chain();
    }

    /** 
     * Adds a condition to the WHERE clause where if the specified column is greater than or equal to the value specified.
     * @type {Condition<TTableModel, TColumn>} 
     */
    greaterThanOrEqualTo(value) {
        this._current.value = value;
        this._current.operator = ">=";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column contains any of the values specified.
     * @param {TTableModel[TColumn][]} values
     * @returns {Chain<TTableModel>} 
     */
    in(values) {
        this._current.value = values;
        this._current.operator = "IN";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column, as a string, is like, by SQL's LIKE command syntax, the value specified.
     * This operation is case insensitive.
     * @param {string} value
     * @returns {Chain<TTableModel>} 
     */
    like(value) {
        this._current.value = value;
        this._current.operator = "LIKE";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column, as a string, contains the value specified.
     * This operation is case insensitive.
     * @param {string} value
     * @returns {Chain<TTableModel>} 
     */
    contains(value) {
        this._current.value = `%${value}%`;
        this._current.operator = "LIKE";
        this._insert();
        return this._chain();
    }

    /**
     * Returns the built WHERE command. (sanitized)
     * @returns {string} WHERE clause string used in the SQL command.
     */
    toString() {
        let conditionsClone = JSON.parse(JSON.stringify(this._conditions));
        const cmd = toStringRecursive(this._conditions);
        this._conditions = conditionsClone;

        return cmd;
    }

    /**
     * Returns an array of the value arguments to be passed in with the query with sanitization.
     * @returns {(string|number|boolean|Date)[]}
     */
    getArgs() {
        return flatten(this._conditions).map(c => c.value);
    }

    // Private functions

    /**
     * Chains a ConditionConfig
     * @private 
     * @returns {Chain<TTableModel>}
     */
    _chain() {
        return new Proxy({
            and: (modelCallback) => {
                const wb = modelCallback(new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (String(p).startsWith("$")) {
                            return new Proxy(/** @type {any} */({}), {
                                get: (t, p2, r) => {
                                    return Where(String(p2), this._table, "AND");
                                }
                            })
                        }
                        return Where(String(p), this._table, "AND");
                    }
                }));
                // @ts-ignore ._conditions is private, and since this is in a lambda function, ts thinks we aren't in the WhereBuilder class.
                this._conditions = [...this._conditions, wb._conditions];
                return this._chain();
            },
            or: (modelCallback) => {
                const wb = modelCallback(new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (String(p).startsWith("$")) {
                            return new Proxy(/** @type {any} */({}), {
                                get: (t, p2, r) => {
                                    return Where(String(p2), this._table, "OR");
                                }
                            })
                        }
                        return Where(String(p), this._table, "OR");
                    }
                }));
                // @ts-ignore ._conditions is private, and since this is in a lambda function, ts thinks we aren't in the WhereBuilder class.
                this._conditions = [...this._conditions, wb._conditions];
                return this._chain();
            }
        }, {
            get: (t, p, r) => {
                if(String(p) === "_conditions") {
                    return this._conditions;
                }
                if (String(p) !== "and" && String(p) !== "or") {
                    throw new MySqlContextSyntaxError(`You can only chain WHERE conditions with 'AND' or 'OR'. ("${String(p)}")`);
                }
                return t[p];
            }
        });
    }

    /**
     * Inserts the object, if it has all of the required properties to build a WHERE conditional.
     * @private
     */
    _insert() {
        if ("chain" in this._current
            && "property" in this._current
            && "value" in this._current
            && "operator" in this._current) {
            this._conditions = [...this._conditions, this._current];
            // @ts-ignore We don't care that the properties don't exist. They will be filled in, we just don't want the old values.
            this._current = {};
        } else {
            console.log(this._current);
            throw Error('???');
        }
    }

    // Synonyms

    eq = this.equals;
    neq = this.notEquals;
    lt = this.lessThan;
    lteq = this.lessThanOrEqualTo;
    gt = this.greaterThan;
    gteq = this.greaterThanOrEqualTo;
}

/**
 * Recursively flattens a recursively nested array into a single array.
 * @param {any[]} items 
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
 * Recursively builds a complete "WHERE" conditional string 
 * @template {AbstractModel} TTableModel
 * @param {ConditionConfig<TTableModel>|RecursiveArray<ConditionConfig<TTableModel>>} conditions 
 * @returns 
 */
function toStringRecursive(conditions, x=0) {
    if (conditions === undefined) return "";
    if (Array.isArray(conditions)) {
        let s = "";
        for (const conds of conditions) {
            if (!Array.isArray(conds)) {
                s += `\n${Array.from(Array(x + 1 + (conds.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${conds.chain} ${String(conds.property)} ${conds.operator} ?`
            } else {
                if (conds.length > 1) {
                    const cond = conds.shift();
                    // @ts-ignore ignoring because recursive types are strange.
                    s += `\n${Array.from(Array(x + 1 + (cond.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${cond.chain} (${cond.property} ${cond.operator} ?${toStringRecursive(conds, x+1)})`;
                } else {
                    const cond = conds.shift();
                    // @ts-ignore ignoring because recursive types are strange.
                    s += `\n${Array.from(Array(x + 1 + (cond.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('') }${cond.chain} ${cond.property} ${cond.operator} ?`
                }
            }
        }
        return s;
    }
    return `\n${Array.from(Array(x + 1 + (conditions.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('') }${conditions.chain} ${String(conditions.property)} ${conditions.operator} ?`;
}

/**
 * Recursively nested array of T generic types.
 * @template T
 * @typedef {(T|RecursiveArray<T>)[]} RecursiveArray
 */

/**
 * Augments keys from T where the respective values of each key extend AbstractModel into the same key but prepended with '$'. 
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as T[K] extends AbstractModel|undefined ? never : K]: T[K]} & {[K in keyof T as K extends string ? T[K] extends AbstractModel|undefined ? `$${K}` : never : never]: T[K]}} AugmentKeysWith$
 */

/**
 * Object to chain AND and OR conditions onto a WHERE clause.
 * @template {AbstractModel} TTableModel
 * @typedef {Object} Chain
 * prop {(modelCallback: (m: {[K in keyof import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>]: WhereBuilder<import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>, K>}) => void) => Chain<TTableModel>} and Apply an AND chain to your WHERE clause.
 * prop {(modelCallback: (m: {[K in keyof import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>]: WhereBuilder<import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>, K>}) => void) => Chain<TTableModel>} or Apply an OR chain to your WHERE clause.
 * @prop { (modelCallback: (m: { [K in keyof AugmentKeysWith$<TTableModel>]: AugmentKeysWith$<TTableModel>[K] extends AbstractModel | undefined ? { [K2 in keyof Required<AugmentKeysWith$<TTableModel>[K]>]: WhereBuilder<Required<AugmentKeysWith$<TTableModel>[K]>, K2> } : WhereBuilder<TTableModel, K extends symbol ? never : K> }) => Chain<TTableModel>) => Chain<TTableModel>} and Apply an AND chain to your WHERE clause.
 * @prop { (modelCallback: (m: { [K in keyof AugmentKeysWith$<TTableModel>]: AugmentKeysWith$<TTableModel>[K] extends AbstractModel | undefined ? { [K2 in keyof Required<AugmentKeysWith$<TTableModel>[K]>]: WhereBuilder<Required<AugmentKeysWith$<TTableModel>[K]>, K2> } : WhereBuilder<TTableModel, K extends symbol ? never : K> }) => Chain<TTableModel>) => Chain<TTableModel>} or Apply an OR chain to your WHERE clause.
 */

/**
 * Function definition for every type of condition to be created in a WHERE clause.
 * @template {AbstractModel} TTableModel
 * @template {keyof TTableModel} TColumn
 * @callback Condition
 * @param {TTableModel[TColumn]} value
 * @returns {Chain<TTableModel>}
 */

/** 
 * Function used to help initialize building a WHERE clause.
 * @template {AbstractModel} TTableModel 
 * @typedef {(m: {[K in keyof TTableModel]: WhereBuilder<TTableModel, K>}) => void} WhereBuilderFunction 
 */

/**
 * Condition configuration used to assist in building WHERE clauses.
 * @template {AbstractModel} TTableModel
 * @typedef {Object} ConditionConfig
 * @property {number} depth
 * @property {"WHERE"|"OR"|"AND"} chain
 * @property {keyof TTableModel} property
 * @property {"="|"<>"|"<"|">"|"<="|">="|"LIKE"|"IN"} operator
 * @property {string|number|boolean|Date|string[]|number[]|boolean[]|Date[]} value
 */
