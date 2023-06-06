//@ts-check
import { MyORMInternalError } from "./exceptions.js";
import { deepCopy } from "./util.js";
import { Where, WhereBuilder } from "./where-builder.js";

/**
 * @typedef {{[key: string]: Date|boolean|string|number|bigint|AbstractModel|AbstractModel[]}} AbstractModel
 */

/**
 * @typedef {object} MyORMOptions
 * @prop {boolean=} allowTruncation
 * Disable protective measures to prevent an accidental truncation of your table through the `.truncate()` function. (default: false)
 * @prop {boolean=} allowUpdateAll
 * Disable protective measures to prevent an accidental update of all records on your table. (default: false)
 */

/**
 * @template {AbstractModel} TTableModel
 * @template {AbstractModel} [TAliasModel=TTableModel]
 */
export class MyORMContext {
    /** @type {string} */ #table;
    /** @type {Set<DescribedSchema>} */ #schema;
    #state;
    /** @type {MyORMAdapter<TAliasModel>} */ #adapter;
    /** @type {MyORMOptions} */ #options;
    /** @type {Promise} */ #promise;

    constructor(adapter, table, tableOptions) {

    }

    /**
     * @param {((model: TTableModel) => string)=} modelCallback
     * @returns {Promise<TAliasModel[]>}
     */
    async select(modelCallback=undefined) {
        return [];
    }

    async insert(records) {

    }

    async update(records) {

    }

    async delete(records) {

    }

    /**
     * Set the context to explicitly update or delete using manually built clauses.
     */
    get explicitly() {
        this.#state.explicit = true;
        return this;
    }

    /**
     * Set the context to implicitly update or delete using primary keys defined on the table.
     */
    get implicitly() {
        this.#state.explicit = false;
        return this;
    }

    async #query() {

    }

    async #update() {

    }

    async #delete() {

    }

    async #insert() {

    }

    /**
     * 
     * @param {string} table 
     * Table to describe. 
     * @returns {Promise<Set<DescribedSchema>>}
    */
    async #describe(table) {
        const { cmd, args } = this.#adapter
            .serialize({ MyORMAdapterError: () => Error(), Where: {} })
            .forDescribe(table);
        return this.#adapter
            .execute({ MyORMAdapterError: () => Error(), Where: {} })
            .forDescribe(cmd, args);
    }

    take(n) {
        return this.#transfer(ctx => {
            ctx.#state.limit = n;
        });
    }

    limit = this.take;

    skip(n) {
        return this.#transfer(ctx => {
            ctx.#state.offset = n;
        });
    }

    offset = this.skip;

    /**
     * 
     * @param {(model: TTableModel) => WhereBuilder<TTableModel>} modelCallback 
     * @returns 
     */
    where(modelCallback) {
        return this.#transfer(ctx => {
            const newProxy = (table = this.#table) => new Proxy({}, {
                get: (t,p,r) => {
                    if (typeof (p) === 'symbol') throw new MyORMInternalError();
                    if (this.#isRelationship(p)) {
                        return newProxy(p);
                    }
                    return Where(p, table, this.#state.relationships, "WHERE");
                }
            });
        });
    }

    filter = this.where;

    /**
     * 
     * @param {(model: SortByCallbackModel<TTableModel>) => SortByClauseProperty|SortByClauseProperty[]} modelCallback 
     * @returns {MyORMContext<TTableModel, TAliasModel>}
     */
    sortBy(modelCallback) {
        return this.#transfer(ctx => {
            const newProxy = (table = this.#table) => new Proxy({}, {
                get: (t,p,r) => {
                    if (typeof (p) === 'symbol') throw new MyORMInternalError();
                    if (this.#isRelationship(p)) {
                        return newProxy(p);
                    }
                    let o = {
                        table,
                        column: p,
                        direction: "ASC",
                        asc: () => ({ ...o, direction: "ASC" }),
                        desc: () => ({ ...o, direction: "DESC" })
                    };
                    return o;
                }
            });
    
            const sorts = modelCallback(newProxy());

            ctx.#state.sortBy = Array.isArray(sorts) ? sorts : [sorts];
        });
    }

    sort = this.sortBy;

    /**
     * @template {spf_GroupByClauseProperty<TTableModel>|spf_GroupByClauseProperty<TTableModel>[]} T
     * @param {(model: GroupByCallbackModel<TTableModel>) => T} modelCallback 
     * @returns {MyORMContext<TTableModel, T>}
     */
    groupBy(modelCallback) {
        return this.#transfer(ctx => {
            const newProxy = (table = this.#table) => new Proxy({}, {
                get: (t, p, r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                    if (this.#isRelationship(p)) {
                        return newProxy(p);
                    }
                    let o = {
                        table,
                        column: p,
                        avg: () => ({ ...o, aggregate: "AVG" }),
                        count: () => ({ ...o, aggregate: "COUNT" }),
                        min: () => ({ ...o, aggregate: "MIN" }),
                        max: () => ({ ...o, aggregate: "MAX" }),
                        sum: () => ({ ...o, aggregate: "SUM" }),
                        total: () => ({ ...o, aggregate: "TOTAL" })
                    };
                    return o;
                }
            });

            const groups = modelCallback(newProxy());

            ctx.#state.groupBy = Array.isArray(groups) ? groups : [groups];
        });
    }

    group = this.groupBy;

    alias() {

    }

    map = this.alias;

    choose() {

    }

    columns = this.choose;

    /**
     * @template {AbstractModel} TNewAliasModel
     * @param {(ctx: MyORMContext<TTableModel, TNewAliasModel>) => void} callback 
     * @returns {MyORMContext<TTableModel, any>}
     */
    #transfer(callback) {
        /** @type {MyORMContext<TTableModel, TNewAliasModel>} */
        const ctx = new MyORMContext(this.#adapter, this.#table, this.#options);
        ctx.#promise = this.#promise.then(() => {
            ctx.#state = {...this.#state};
            ctx.#state.relationships = deepCopy(this.#state.relationships);
            callback(ctx);
            ctx.#schema = this.#schema;
            ctx.#state = {...this.#state, ...ctx.#state};
        });
        return ctx;
    }

    #isRelationship(table) {
        return table in this.#state.relationships;
    }
}

/**
 * @template T
 * @typedef {T|T[]} MaybeArray
 */

/**
 * @typedef {boolean|string|number|Date|bigint} SQLPrimitive
 */

/** 
 * @typedef {SQLPrimitive|{ value: SQLPrimitive, varName: string }} ExecutionArgument
 */

/**
 * Object representing the schema of a column in a table.
 * @typedef {object} DescribedSchema
 * @prop {string} table
 * The raw name of the table this field belongs to.
 * @prop {string} field
 * The raw name of the field as it is displayed in the database's table.
 * @prop {boolean} isPrimary
 * True if the column is a primary key.
 * @prop {boolean} isIdentity
 * True if the column is an identity key. (automatically increments)
 * @prop {SQLPrimitive} defaultValue
 * Value that should be assigned if the column was not explicitly specified in the insert.
 */

/**
 * @typedef {object} Column
 * @prop {string} table
 * @prop {string} column
 * @prop {string} alias
 */

/**
 * @typedef {Column} SelectClauseProperty
 */

/**
 * @typedef {object} FromClauseProperty
 * @prop {string} table
 * @prop {string} alias
 * @prop {SelectClauseProperty} sourceTableKey
 * @prop {SelectClauseProperty} targetTableKey
 */

/**
 * Augments the given type, `TTransformingModel` so that all of its non `AbstractModel` property types 
 * (including nested properties within `AbstractModel` type properties) instead have the type, `TFinalType`.  
 * @template {AbstractModel} TTransformingModel
 * Type to recurse through to augment.
 * @template TFinalType
 * Type to augment SQL primitive types (non `AbstractModel` types) to.
 * @typedef {{[K in keyof TTransformingModel]-?: TTransformingModel[K] extends (infer U extends AbstractModel)[]|undefined ? AugmentModel<U, TFinalType> : TTransformingModel[K] extends (AbstractModel|undefined) ? AugmentModel<TTransformingModel[K], TFinalType> : TFinalType}} AugmentModel
 */

/**
 * @template {AbstractModel} T
 * @template {string} S
 * @typedef {{[K in keyof T]: S}} Superficial
 */

/**
 * Augments the given type, `TTransformingModel` so that all of its non `AbstractModel` property types 
 * (including nested properties within `AbstractModel` type properties) instead have the type of string with all keys.  
 * __NOTE: This is a superficial type, meaning the actual types used within JS code may not align with this type.__
 * @template {AbstractModel} TTransformingModel
 * Type to recurse through to augment.
 * @template {string} [TKey=keyof TTransformingModel & string]
 * @typedef {{[K in keyof TTransformingModel]-?: TTransformingModel[K] extends (infer U extends AbstractModel)[]|undefined ? spf_AugmentModel<U, `${TKey}_${K & string}`> : TTransformingModel[K] extends (AbstractModel|undefined) ? spf_AugmentModel<TTransformingModel[K], `${TKey}_${K & string}`> : Superficial<TTransformingModel, `${TKey}_${K & string}`>}} spf_AugmentModel
 */

/***************************************************************
 *                            WHERE                            *
 ***************************************************************/

/** @typedef {"WHERE"|"WHERE NOT"|"AND"|"AND NOT"|"OR"|"OR NOT"} WhereChain */
/** @typedef {"="|"<>"|"<"|">"|"<="|">="|"IN"|"LIKE"} WhereCondition */
/** @typedef {[WhereClauseProperty, ...(WhereClauseProperty|WhereClausePropertyArray)[]]} WhereClausePropertyArray */

/**
 * @typedef {object} WhereClauseProperty
 * @prop {string} property
 * @prop {WhereChain} chain
 * @prop {MaybeArray<SQLPrimitive>} value
 * @prop {WhereCondition} condition
 */

/******************************************************************
 *                            GROUP BY                            *
 ******************************************************************/

/**
 * @typedef {Column & { aggregate?: "AVG"|"COUNT"|"MIN"|"MAX"|"SUM"|"TOTAL" }} GroupByClauseProperty
 */

/**
 * @typedef {object} GroupByCallbackModelProp
 * @prop {() => GroupByClauseProperty} total
 */

/**
 * @template {AbstractModel} T
 * @typedef {AugmentModel<T, GroupByCallbackModelProp>} GroupByCallbackModel
 */

// superficial

/**
 * __NOTE: This is a superficial type, meaning the actual types used within JS code may not align with this type.__
 * @template {AbstractModel} T
 * @typedef {spf_AugmentModel<T>} spf_GroupByClauseProperty
 */

/******************************************************************
 *                            SORT BY                             *
 ******************************************************************/

/**
 * @typedef {Column & { direction: "ASC"|"DESC"}} SortByClauseProperty
 */

/**
 * @typedef {object} SortByCallbackModelProp
 * @prop {() => SortByClauseProperty} asc
 * @prop {() => SortByClauseProperty} desc
 */

/**
 * @template {AbstractModel} T
 * @typedef {AugmentModel<T, SortByCallbackModelProp>} SortByCallbackModel
 */

/***********************************************************************
 *                            SERIALIZATION                            *
 ***********************************************************************/

/**
 * Data passed for the scope of the custom adapter to help serialize a query command.
 * @typedef {object} SerializationQueryHandlerData
 * @prop {WhereClausePropertyArray=} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 * @prop {number=} limit
 * Number representing the number of records to grab.
 * @prop {number=} offset
 * Number representing the number of records to skip before grabbing. 
 * @prop {SortByClauseProperty[]} order_by
 * Array of objects where each object represents a column to order by.
 * @prop {GroupByClauseProperty[]} group_by
 * Array of objects where each object represents a column to group by.
 * @prop {SelectClauseProperty[]} select
 * Array of objects where each object represents a column to select.
 * @prop {FromClauseProperty[]} from
 * Array of objects where each object represents a table to join on.  
 * The first object will represent the main table the context is connected to. 
 */

/**
 * Data passed for the scope of the custom adapter to help serialize an insert command.
 * @typedef {object} SerializationInsertHandlerData
 * @prop {string[]} columns
 * @prop {SQLPrimitive[][]} values
 */

/**
 * Data passed for the scope of the custom adapter to help serialize an update command.
 * @typedef {object} SerializationUpdateHandlerData
 * @prop {WhereClausePropertyArray=} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 * @prop {AbstractModel=} updateObject Used in an `explicit transaction`.  
 * Object representing what columns will be updated from the command.  
 * If this is undefined, then `objects` should be used.
 * @prop {AbstractModel[]=} objects Used in an `implicit transaction`.  
 * Array of objects that represent the table in the context that should be updated from the command.
 * If this is undefined, then `updateObject` should be used.
 */

/**
 * Data passed for the scope of the custom adapter to help serialize a delete command.
 * @typedef {object} SerializationDeleteHandlerData
 * @prop {WhereClausePropertyArray=} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 */

/**
 * Handlers required to make a custom adapter for `MyORM`.
 * @typedef {object} SerializationHandlers
 * @prop {(data: SerializationQueryHandlerData) => { cmd: string, args: ExecutionArgument[] }} forQuery
 * Handles serialization of a query command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationQueryHandlerData) => { cmd: string, args: ExecutionArgument[] }} forCount
 * Handles serialization of a query command for `COUNT` and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationInsertHandlerData) => { cmd: string, args: ExecutionArgument[] }} forInsert
 * Handles serialization of a insert command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationUpdateHandlerData) => { cmd: string, args: ExecutionArgument[] }} forUpdate
 * Handles serialization of a update command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationDeleteHandlerData) => { cmd: string, args: ExecutionArgument[] }} forDelete
 * Handles serialization of a delete command and its arguments so it appropriately works for the given database connector.
 * @prop {(table: string) => { cmd: string, args: ExecutionArgument[] }} forDescribe
 * Handles serialization of a describe command and its arguments so it appropriately works for the given database connector.
 */

/*******************************************************************
 *                            EXECUTION                            *
 *******************************************************************/

/**
 * @typedef {object} ExecutionHandlers
 * @prop {(cmd: string, args: ExecutionArgument[]) => any[]} forQuery
 * Handles execution of a query command, given the command string and respective arguments for the comamnd string.  
 * This should return an array of objects where each object represents the row returned from the query.
 * @prop {(cmd: string, args: ExecutionArgument[]) => number} forCount
 * Handles the execution of a query for `COUNT` command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows retrieved from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => number[]} forInsert
 * Handles execution of an insert command, given the command string and respective arguments for the comamnd string.
 * This should return an array of numbers, where each number represents a table's primary key's auto incremented number (if applicable)  
 * This array should be parallel with the array of records that were serialized in the `serialize(...).forInsert()` function.
 * @prop {(cmd: string, args: ExecutionArgument[]) => number} forUpdate
 * Handles execution of an update command, given the command string and respective arguments for the comamnd string.
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => number} forDelete
 * Handles execution of a delete command, given the command string and respective arguments for the comamnd string.
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => Set<DescribedSchema>} forDescribe
 * Handles execution of a describe command, given the command string and respective arguments for the comamnd string.
 * This should return a Set containing each field as a property,
 *  where each field points to an object representing the schema of the table described.
 */


/*****************************************************************
 *                            ADAPTER                            *
 *****************************************************************/

/**
 * @typedef {object} AdapterScope
 * @prop {() => Error} MyORMAdapterError
 * @prop {any} Where
 */

/**
 * Additional options that can be restricted specifically for the adapter's use.
 * @typedef {object} AdapterOptions
 * @prop {boolean=} allowTruncation
 * Allow the user to truncate the table.
 * @prop {boolean=} allowUpdateAll
 * Allow the user to update all records in the table.
 * @prop {boolean=} eventHandling 
 * Allow the user to attach event handlers to the table.
 */

/**
 * Tools to assist with the adapter's syntax of how commands should be serialized.
 * @typedef {object} AdapterSyntax
 * @prop {(s: string) => string} escapeTable
 * Escapes a table in the command to protect against SQL injections.
 * `s` is the table to escape.
 * @prop {(s: string) => string} escapeColumn
 * Escapes a column in the command to protect against SQL injections.  
 * `s` is the column to escape.
 */

/**
 * @template {AbstractModel} T
 * @typedef {object} MyORMAdapter
 * @prop {AdapterOptions} options
 * @prop {AdapterSyntax} syntax
 * @prop {(scope: AdapterScope) => ExecutionHandlers} execute
 * @prop {(scope: AdapterScope) => SerializationHandlers} serialize
 */

/**
 * @template T
 * Type of the expected argument that needs to be passed into the `adapter()` function that represents the connection to the source.
 * @callback InitializeAdapterCallback
 * @param {T} config
 * @returns {MyORMAdapter<T>}
 */

/**
 * @param {WhereClausePropertyArray=} conditions
 * @param {string} table
 * @returns {{cmd: string, args: SQLPrimitive[]}}
 */
function handleWhere(conditions, table="") {
    if(!conditions) return { cmd: '', args: [] };
    let args = [];

    // function to filter out conditions that do not belong to table.
    const mapFilter = (x) => {
        if(Array.isArray(x)) {
            const filtered = x.map(mapFilter).filter(x => x !== undefined);
            return filtered.length > 0 ? filtered : undefined;
        }
        if(x.property.includes(table)) {
            return x;
        }
        return undefined;
    }

    // function to reduce each condition to one appropriate clause string.
    const reduce = (a, b) => {
        if(Array.isArray(b)) {
            const [x, ...remainder] = b;
            args.push(x.value);
            return `${a} ${remainder.reduce(reduce, ` ${x.chain} (${x.property} ${x.condition} ?`) + ')'}`;
        }
        args.push(b.value);
        return a + ` ${b.chain} ${b.property} ${b.condition} ?`;
    };
    
    // map the array, filter out undefineds, then reduce the array to get the clause.
    const reduced = conditions.map(mapFilter).filter(x => x !== undefined).reduce(reduce, '');
    return {
        // if a filter took place, then the WHERE statement of the clause may not be there, so we replace.
        cmd: reduced.startsWith(" WHERE") ? reduced : reduced.startsWith(" AND") ? reduced.replace("AND", "WHERE") : reduced.replace("OR", "WHERE"),
        // arguments was built inside the reduce function.
        args
    };
}


/** @type {InitializeAdapterCallback<{}>} */
function adapter(config) {
    return {
        options: {

        },
        syntax: {
            escapeColumn: (s) => `\`${s}\``,
            escapeTable: (s) => `\`${s}\``
        },
        execute(scope) {
            return {
                forQuery(cmd, args) {
                    return [];
                },
                forCount(cmd, args) {
                    return 0;
                },
                forInsert(cmd, args) {
                    return [];
                },
                forUpdate(cmd, args) {
                    return 0;
                },
                forDelete(cmd, args) {
                    return 0;
                },
                forDescribe(cmd, args) {
                    return new Set();
                }
            }
        },
        serialize() {
            return {
                forQuery(data) {
                    let cmd = '';
                    let args = [];
                    let { where, group_by, order_by, limit, offset, select, from } = data;
                    
                    cmd += `SELECT ${select.map(prop => `${prop.table}.${prop.column} AS ${prop.alias}`).join('\n\t\t,')}`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    cmd += `FROM `;
                    // if a limit or offset was specified, and an join is expected, then a nested query should take place of the first table.
                    if(limit && from.length > 1) {
                        let main;
                        [main, ...from] = from;
                        cmd += `(SELECT * FROM ${main.table} ${handleWhere(where, main.table).cmd} ${limitStr} ${offsetStr}) AS ${from[0].alias}`;
                    } 
                    cmd += from.map(table => `${table.table} AS ${table.alias} ON ${table.sourceTableKey.table}.${table.sourceTableKey.alias} = ${table.targetTableKey.table}.${table.targetTableKey.alias}`).join('\n\t\tLEFT JOIN');
                    cmd += handleWhere(where);
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if(limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }


                    return { cmd: "", args: [] };
                },
                forCount(data) {
                    return { cmd: "", args: [] };
                },
                forInsert(data) {
                    return { cmd: "", args: [] };
                },
                forUpdate(data) {
                    return { cmd: "", args: [] };
                },
                forDelete(data) {
                    return { cmd: "", args: [] };
                },
                forDescribe(data) {
                    return { cmd: "", args: [] };
                }
            }
        }
    }
}

/**
 * @typedef {object} TestModel
 * @prop {number} x
 * @prop {string} y
 * @prop {boolean} z
 * @prop {Foo=} foo
 * @prop {Bar[]=} bar
 */

/**
 * @typedef {object} Foo
 * @prop {number} a
 * @prop {string} b
 * @prop {boolean} c
 */

/**
 * @typedef {object} Bar
 * @prop {number} d
 * @prop {string} e
 * @prop {boolean} f
 */

/** @type {MyORMContext<TestModel>} */
const ctx = new MyORMContext(adapter({}), "Blah");
ctx.sortBy(m => m.foo.a.asc());
ctx.groupBy(m => m.foo.a.total()).select().then(results => {
    results.
});