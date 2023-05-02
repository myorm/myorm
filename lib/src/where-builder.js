// @ts-check

import { MyORMSyntaxError } from './exceptions.js';
import * as Types from './types.js';

/** @typedef {{[key: string]: any}} AbstractModel */

/**
 * Initializes the first parts of a WhereBuilder given the column name and table name.
 * @template {AbstractModel} TTableModel
 * @template {keyof TOriginalModel} TColumn
 * @template {AbstractModel} [TOriginalModel=TTableModel]
 * @param {TColumn} column
 * @param {string} table
 * @param {"WHERE"|"AND"|"OR"} chain
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
    /** @private @type {Types.RecursiveArray<Types.ConditionConfig<TOriginalModel>>} */ _conditions;
    /** @private @type {string} */ _table;
    /** @private @type {Types.ConditionConfig<TOriginalModel>} */ _current;
    /** @private @type {number} */ _depth;
    /** @private @type {boolean} */ _nesting;

    /**
     * 
     * @param {keyof TOriginalModel} column 
     * @param {string} table
     * @param {"WHERE"|"AND"|"OR"} chain
     */
    constructor(column, table, relationships, chain="WHERE") {
        // @ts-ignore
        this._current = { depth: 0, chain, property: `\`${table}\`.\`${column}\`` }
        this._table = table;
        this._conditions = [];
        this._relationships = relationships;
    }

    // Public functions

    /**
     * Adds a condition to the WHERE clause where if the specified column is equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    equals(value) {
        this._current.value = value;
        this._current.operator = "=";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is not equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    notEquals(value) {
        this._current.value = value;
        this._current.operator = "<>";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    lessThan(value) {
        this._current.value = value;
        this._current.operator = "<";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than or equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    lessThanOrEqualTo(value) {
        this._current.value = value;
        this._current.operator = "<=";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is greater than the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    greaterThan(value) {
        this._current.value = value;
        this._current.operator = ">";
        this._insert();
        return this._chain();
    }

    /** 
     * Adds a condition to the WHERE clause where if the specified column is greater than or equal to the value specified.
     * @type {Types.Condition<TOriginalModel, TColumn>} 
     */
    greaterThanOrEqualTo(value) {
        this._current.value = value;
        this._current.operator = ">=";
        this._insert();
        return this._chain();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column contains any of the values specified.
     * @param {TOriginalModel[TColumn][]} values
     * @returns {Types.Chain<TOriginalModel>} 
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
     * @returns {Types.Chain<TOriginalModel>} 
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
     * @returns {Types.Chain<TOriginalModel>} 
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
    toString(table="") {
        let conditionsClone = JSON.parse(JSON.stringify(this._conditions));
        const cmd = toStringRecursive(this._conditions, table);
        this._conditions = conditionsClone;
        return cmd;
    }

    /**
     * Returns an array of the value arguments to be passed in with the query with sanitization.
     * @returns {(string|number|boolean|Date)[]}
     */
    getArgs(table="") {
        return flatten(this._conditions).filter(c => c.property.includes(table)).flatMap(c => c.value === undefined ? null : c.value);
    }

    // Private functions

    /**
     * Chains a ConditionConfig
     * @private 
     * @returns {Types.Chain<TOriginalModel>}
     */
    _chain() {
        return new Proxy({
            and: (modelCallback) => {
                const newProxy = (table) => new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (p in this._relationships) {
                            return newProxy(this._relationships[p].thatTable);
                        }
                        return Where(String(p), table, this._relationships, "AND");
                    }
                });
                const wb = modelCallback(newProxy(this._table));
                // @ts-ignore ._conditions is private, and since this is in a lambda function, ts thinks we aren't in the WhereBuilder class.
                this._conditions = [...this._conditions, wb._conditions];
                return this._chain();
            },
            or: (modelCallback) => {
                const newProxy = (table="") => new Proxy(/** @type {any} */ ({}), {
                    get: (t,p,r) => {
                        if(p in this._relationships) {
                            return newProxy(this._relationships[p].thatTable);
                        }
                        return Where(String(p), table != "" ? table :this._table, this._relationships, "OR");
                    }
                });
                const wb = modelCallback(newProxy());
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
                    throw new MyORMSyntaxError(`You can only chain WHERE conditions with 'AND' or 'OR'. ("${String(p)}")`);
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
            if(this._current.value == null) {
                if (this._current.operator == "=") {
                    this._current.operator = "IS";
                }
                if(this._current.operator == "<>") {
                    this._current.operator = "IS NOT";
                }
            }
            this._conditions = [...this._conditions, this._current];
            // @ts-ignore We don't care that the properties don't exist. They will be filled in, we just don't want the old values.
            this._current = {};
        } else {
            throw Error('???');
        }
    }

    /**
     * Clones this instance into a new instance. This is marked private because is solely used in `MyORMContext`.
     * @private
     * @returns {WhereBuilder<TTableModel, TColumn, TOriginalModel>}
     */
    _clone() {
        /** @type {WhereBuilder<TTableModel, TColumn, TOriginalModel>} */
        const where = new WhereBuilder("", this._table, this._relationships);
        //@ts-ignore
        where._current = {};
        //@ts-ignore
        where._conditions = this._conditions;
        return where;
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
 * @param {Types.ConditionConfig<TTableModel>|Types.RecursiveArray<Types.ConditionConfig<TTableModel>>} conditions 
 * @param {string} table
 * @param {number} x
 * @returns 
 */
function toStringRecursive(conditions, table, x=0) {
    if (conditions === undefined) return "";
    if (Array.isArray(conditions)) {
        let s = "";
        for (const conds of conditions) {
            if (!Array.isArray(conds)) {
                if(String(conds.property).includes(table)) {
                    s += `\n${Array.from(Array(x + 1 + (conds.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${conds.chain} ${String(conds.property)} ${conds.operator} ${Array.isArray(conds.value) ? `(${conds.value.map(_ => '?').join(',')})` : '?'}`;
                }
            } else {
                if (conds.length > 1) {
                    const cond = conds.shift();
                    // @ts-ignore ignoring because recursive types are strange.
                    if (cond.property.includes(table)) {
                        // @ts-ignore ignoring because recursive types are strange.
                        s += `\n${Array.from(Array(x + 1 + (cond.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${cond.chain} (${cond.property} ${cond.operator} ${Array.isArray(cond.value) ? `(${cond.value.map(_ => '?').join(',')})` : '?'}${toStringRecursive(conds, table, x+1)})`;
                    }
                } else {
                    const cond = conds.shift();
                    // @ts-ignore ignoring because recursive types are strange.
                    if (cond.property.includes(table)) {
                        // @ts-ignore ignoring because recursive types are strange.
                        s += `\n${Array.from(Array(x + 1 + (cond.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('')}${cond.chain} ${cond.property} ${cond.operator} ${Array.isArray(cond.value) ? `(${cond.value.map(_ => '?').join(',')})` : '?'}`;
                    }
                }
            }
        }
        return s;
    }
    if(String(conditions.property).includes(table)) {
        return `\n${Array.from(Array(x + 1 + (conditions.chain != "WHERE" ? 1 : 0)).keys()).map(_ => '\t').join('') }${conditions.chain} ${String(conditions.property)} ${conditions.operator} ${Array.isArray(conditions.value) ? `(${conditions.value.map(_ => '?').join(',')})` : '?'}`;
    }
    return "";
}
