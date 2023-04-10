// @ts-check

import { MySqlContextSyntaxError } from './exceptions.js';

/**
 * Initializes the first parts of a WhereBuilder given the column name and table name.
 * @template {import('./toolbelt.js').AbstractModel} TTableModel
 * @template {keyof TTableModel} TColumn
 * @param {TColumn} column
 * @param {string} table
 * @returns {WhereBuilder<TTableModel, TColumn>}
 */
export function Where(column, table) {
    return new WhereBuilder(column, table);
}

/**
 * Assists in building a WHERE clause.
 * @template {import('./toolbelt.js').AbstractModel} TTableModel Table model that the WHERE clause is being built for.
 * @template {keyof TTableModel} TColumn Initial column type for when the WhereBuilder is created.
 */
export class WhereBuilder {
    /** @private @type {import('./types/where-builder.js').RecursiveArray<import('./types/where-builder.js').ConditionConfig<TTableModel>>} */ _conditions;
    /** @private @type {string} */ _table;
    /** @private @type {import('./types/where-builder.js').ConditionConfig<TTableModel>} */ _current;
    /** @private @type {number} */ _depth;
    /** @private @type {boolean} */ _nesting;
    
    /**
     * 
     * @param {keyof TTableModel} column 
     * @param {string} table
     */
    constructor(column, table) {
        /** @ts-ignore */
        this._current = { depth: 0, chain: "WHERE", property: `\`${table}\`.\`${column}\`` }
        this._conditions = [];
        this._table = table;
        this._depth = 0;
        // set nesting to true for the first statement
        this._nesting = true;
    }

    // Public functions

    /**
     * Adds a condition to the WHERE clause where if the specified column is equal to the value specified.
     * @type {import('./types/where-builder.js').Condition<TTableModel, TColumn>} 
     */
    equals(value) {
        this._current.value = value;
        this._current.operator = "=";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is not equal to the value specified.
     * @type {import('./types/where-builder.js').Condition<TTableModel, TColumn>} 
     */
    notEquals(value) {
        this._current.value = value;
        this._current.operator = "<>";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than the value specified.
     * @type {import('./types/where-builder.js').Condition<TTableModel, TColumn>} 
     */
    lessThan(value) {
        this._current.value = value;
        this._current.operator = "<";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is less than or equal to the value specified.
     * @type {import('./types/where-builder.js').Condition<TTableModel, TColumn>} 
     */
    lessThanOrEqualTo(value) {
        this._current.value = value;
        this._current.operator = "<=";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column is greater than the value specified.
     * @type {import('./types/where-builder.js').Condition<TTableModel, TColumn>} 
     */
    greaterThan(value) {
        this._current.value = value;
        this._current.operator = ">";
        return this._nest();
    }

    /** 
     * Adds a condition to the WHERE clause where if the specified column is greater than or equal to the value specified.
     * @type {import('./types/where-builder.js').Condition<TTableModel, TColumn>} 
     */
    greaterThanOrEqualTo(value) {
        this._current.value = value;
        this._current.operator = ">=";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column contains any of the values specified.
     * @param {TTableModel[TColumn][]} values
     * @returns {import('./types/where-builder.js').Chain<TTableModel>} 
     */
    in(values) {
        this._current.value = values;
        this._current.operator = "IN";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column, as a string, is like, by SQL's LIKE command syntax, the value specified.
     * This operation is case insensitive.
     * @param {string} value
     * @returns {import('./types/where-builder.js').Chain<TTableModel>} 
     */
    like(value) {
        this._current.value = value;
        this._current.operator = "LIKE";
        return this._nest();
    }

    /**
     * Adds a condition to the WHERE clause where if the specified column, as a string, contains the value specified.
     * This operation is case insensitive.
     * @param {string} value
     * @returns {import('./types/where-builder.js').Chain<TTableModel>} 
     */
    contains(value) {
        this._current.value = `%${value}%`;
        this._current.operator = "LIKE";
        return this._nest();
    }

    /**
     * Returns the built WHERE command. (sanitized)
     * @returns {string} WHERE clause string used in the SQL command.
     */
    toString() {
        console.log({ conditions: flatten(this._conditions) } );
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
     * @param {number} depth
     * @returns {import('./types/where-builder.js').Chain<TTableModel>}
     */
    _chain(depth) {
        this._insert(depth);

        const self = this;
        return new Proxy({
            and: (modelCallback) => {
                modelCallback(new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if(String(p).startsWith("$")) {
                            return new Proxy(/** @type {any} */ ({}), {
                                get: (t,p2,r) => {
                                    this._current.property = `\`${String(p).replace("$", "")}\`.\`${String(p2)}\``;
                                    return self;
                                }
                            })
                        }
                        this._current.property = `\`${this._table}\`.\`${String(p)}\``;
                        return self;
                    }
                }));
                return self._chain(depth);
            },
            or: (modelCallback) => {
                modelCallback(new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if(String(p).startsWith("$")) {
                            return new Proxy(/** @type {any} */ ({}), {
                                get: (t,p2,r) => {
                                    this._current.property = `\`${String(p).replace("$", "")}\`.\`${String(p2)}\``;
                                    return self;
                                }
                            })
                        }
                        this._current.property = `\`${this._table}\`.\`${String(p)}\``;
                        return self;
                    }
                }));
                return self._chain(depth);
            }
        }, {
            get: (t,p,r) => {
                if (String(p) !== "and" && String(p) !== "or") {
                    throw new MySqlContextSyntaxError(`You can only chain WHERE conditions with 'AND' or 'OR'. ("${String(p)}")`);
                }
                console.log(depth);
                this._depth = depth;
                this._nesting = false;
                this._current.chain = /** @type {"AND"|"OR"} */ (String(p).toUpperCase());
                return t[p];
            }
        });
    }

    /**
     * Nests a ConditionConfig instead of chaining it.
     * @private
     * @returns {import('./types/where-builder.js').Chain<TTableModel>}
     */
    _nest() {
        if(!this._nesting) return this._chain(this._current.depth);
        const depth = this._depth;
        console.log("nesting", this._current);
        this._insert(depth);
        return new Proxy({
            and: (modelCallback) => {
                modelCallback(new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (String(p).startsWith("$")) {
                            return new Proxy(/** @type {any} */({}), {
                                get: (t, p2, r) => {
                                    this._current.property = `\`${String(p).replace("$", "")}\`.\`${String(p2)}\``;
                                    return this;
                                }
                            })
                        }
                        this._current.property = `\`${this._table}\`.\`${String(p)}\``;
                        return this;
                    }
                }));
                this._nesting = false;
                return this._chain(depth);
            },
            or: (modelCallback) => {
                modelCallback(new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (String(p).startsWith("$")) {
                            return new Proxy(/** @type {any} */({}), {
                                get: (t, p2, r) => {
                                    this._current.property = `\`${String(p).replace("$", "")}\`.\`${String(p2)}\``;
                                    return this;
                                }
                            })
                        }
                        this._current.property = `\`${this._table}\`.\`${String(p)}\``;
                        return this;
                    }
                }));
                this._nesting = false;
                return this._chain(depth);
            }
        }, {
            get: (t,p,r) => {
                if(String(p) !== "and" && String(p) !== "or") {
                    throw new MySqlContextSyntaxError(`You can only chain WHERE conditions with 'AND' or 'OR'. ("${String(p)}")`);
                }
                this._nesting = true;
                this._current.chain = /** @type {"AND"|"OR"} */ (String(p).toUpperCase());
                this._depth += 1;
                this._current.depth = this._depth;
                return t[p];
            }
        });
    }

    /**
     * Inserts the object, if it has all of the required properties to build a WHERE conditional.
     * @private
     * @param {number} depth 
     */
    _insert(depth) {
        if ("chain" in this._current
            && "property" in this._current
            && "value" in this._current
            && "operator" in this._current) 
        {
            this._depth = depth;
            this._current.depth = depth;
            const o = this._insertRecursive(depth);
            this._conditions = o;
            //@ts-ignore
            this._current = { depth };
        }
    }

    /**
     * Recursively inserts the newest built WHERE conditional into the correct recursive array.
     * @private
     * @param {number} depth 
     * @param {import('./types/where-builder.js').RecursiveArray<import('./types/where-builder.js').ConditionConfig<TTableModel>>} conditions 
     * @returns 
     */
    _insertRecursive(depth, conditions=this._conditions) {
        /** @type {import('./types/where-builder.js').ConditionConfig<TTableModel>|import('./types/where-builder.js').RecursiveArray<import('./types/where-builder.js').ConditionConfig<TTableModel>>} */
        let inserting = this._current;
        if (conditions.length <= 0) {
            return [inserting];
        }
        if(depth > 0) {
            if(Array.isArray(conditions[conditions.length-1])) {
                //@ts-ignore
                inserting = this._insertRecursive(--depth, conditions[conditions.length-1]);
            } else {
                return [...conditions, [inserting]];
            }
        }
        if(Array.isArray(inserting)) {
            conditions[conditions.length - 1] = inserting;
        } else {
            conditions = [...conditions, inserting];
        }
        return conditions;
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
 * @template {import('./toolbelt.js').AbstractModel} TTableModel
 * @param {import('./types/where-builder.js').ConditionConfig<TTableModel>|import('./types/where-builder.js').RecursiveArray<import('./types/where-builder.js').ConditionConfig<TTableModel>>} conditions 
 * @returns 
 */
function toStringRecursive(conditions) {
    if (conditions === undefined) return "";
    if (Array.isArray(conditions)) {
        let s = "";
        for (const conds of conditions) {
            if (Array.isArray(conds) && conds.length > 0) {
                const cond = conds.shift();
                // @ts-ignore ignoring because recursive types are strange.
                s += ` ${cond.chain} (${cond.property} ${cond.operator} ? ${toStringRecursive(conds)})`;

            } else {
                // @ts-ignore ignoring because recursive types are strange.
                s += ` ${conds.chain} ${conds.property} ${conds.operator} ?`
            }
        }
        return s;
    }
    return ` ${conditions.chain} ${String(conditions.property)} ${conditions.operator} ?`;
}