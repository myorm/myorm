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
 * @typedef {object} ContextState
 * @prop {SelectClauseProperty[]=} select
 * @prop {FromClauseProperty[]=} from
 * @prop {GroupByClauseProperty[]=} groupBy
 * @prop {SortByClauseProperty[]=} sortBy
 * @prop {number=} limit
 * @prop {number=} offset
 * @prop {WhereBuilder=} where
 * @prop {boolean=} explicit
 * @prop {Record<string, Set<DescribedSchema>>} relationships
 */

/**
 * @template {AbstractModel} TTableModel
 * @template {AbstractModel} [TAliasModel=TTableModel]
 */
export class MyORMContext {
    /** @type {string} */ #table;
    /** @type {Set<DescribedSchema>} */ #schema;
    /** @type {ContextState} */ #state;
    /** @type {MyORMAdapter<any>} */ #adapter;
    /** @type {MyORMOptions} */ #options;
    /** @type {Promise} */ #promise;

    /**
     * 
     * @param {MyORMAdapter<any>} adapter 
     * @param {string} table 
     * @param {MyORMOptions=} tableOptions 
     */
    constructor(adapter, table, tableOptions={}) {
        this.#adapter = adapter;
        this.#table = table;
        this.#options = {
            allowTruncation: false,
            allowUpdateAll: false,
            ...tableOptions
        };
        this.#state = {
            relationships: {}
        }

        this.#promise = this.#describe(table).then(schema => {
            this.#schema = schema;
        })
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
        return this.#duplicate(ctx => {
            ctx.#state.limit = n;
        });
    }

    limit = this.take;

    skip(n) {
        return this.#duplicate(ctx => {
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
        return this.#duplicate(ctx => {
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
        return this.#duplicate(ctx => {
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
     * @template {GroupedColumnsModel<TTableModel>} TGroupedColumns
     * @param {(model: SpfGroupByCallbackModel<TTableModel>, aggregates: Aggregates) => keyof TGroupedColumns|(keyof TGroupedColumns)[]} modelCallback 
     * @returns {MyORMContext<ReconstructAbstractModel<TTableModel, TGroupedColumns>, ReconstructAbstractModel<TTableModel, TGroupedColumns>>} A new context with the all previously configured clauses and the updated groupings.
     */
    groupBy(modelCallback) {
        return this.#duplicate(ctx => {
            const newProxy = (table = this.#table) => new Proxy({}, {
                get: (t, p, r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                    if (this.#isRelationship(p)) {
                        return newProxy(p);
                    }
                    let o = {
                        table,
                        column: p
                    };
                    return o;
                }
            });

            /**
             * 
             * @param {"AVG"|"COUNT"|"MIN"|"MAX"|"SUM"|"TOTAL"} aggr
             * @returns {(col?: any) => any} 
             */
            const getGroupedColProp = (aggr) => {
                return (col) => {
                    const [table, column] = col.split('_');
                    return {
                        table,
                        column,
                        alias: col.replace('_', '<|'),
                        aggregate: aggr
                    }
                };
            };

            const groups = modelCallback(newProxy(), {
                avg: getGroupedColProp("AVG"),
                count: getGroupedColProp("COUNT"),
                min: getGroupedColProp("MIN"),
                max: getGroupedColProp("MAX"),
                sum: getGroupedColProp("SUM"),
                total: getGroupedColProp("TOTAL")
            });

            ctx.#state.groupBy = /** @type {GroupByClauseProperty[]} */ (/** @type {unknown} */ (Array.isArray(groups) ? groups : [groups]));
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
     * Duplicates this context which would expect to have further updates using the `callback` argument.  
     * 
     * Use this function to maintain a desired state between each context.
     * @param {(ctx: MyORMContext<any, any>) => void} callback 
     * Callback that is used to further configure state after the duplication has occurred.
     * @returns {MyORMContext<any, any>}
     * A new context with the altered state.
     */
    #duplicate(callback) {
        /** @type {MyORMContext<any, any>} */
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

    /**
     * Checks to see if `table` is a relationship within this context.
     * @param {string} table 
     * Table to check to see if it is a relationship.
     * @returns {boolean}
     * True if the table associated with this context has a relationship with `table`, otherwise false.
     */
    #isRelationship(table) {
        return table in this.#state.relationships;
    }

    hasOne(modelCallback) {

    }

    hasMany(modelCallback) {

    }

    include(modelCallback) {

    }

    join = this.include;
}

/** MaybeArray
 * @template T
 * @typedef {T|T[]} MaybeArray
 */

/** SQLPrimitive
 * @typedef {boolean|string|number|Date|bigint} SQLPrimitive
 */

/** ExecutionArgument
 * @typedef {SQLPrimitive|{ value: SQLPrimitive, varName: string }} ExecutionArgument
 */

/** DescribedSchema
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

/** Column
 * @typedef {object} Column
 * @prop {string} table
 * @prop {string} column
 * @prop {string} alias
 */

/** SelectClauseProperty
 * @typedef {Column} SelectClauseProperty
 */

/** FromClauseProperty
 * @typedef {object} FromClauseProperty
 * @prop {string} table
 * @prop {string} alias
 * @prop {SelectClauseProperty} sourceTableKey
 * @prop {SelectClauseProperty} targetTableKey
 */

/** AugmentModel
 * Augments the given type, `TTransformingModel` so that all of its non `AbstractModel` property types 
 * (including nested properties within `AbstractModel` type properties) instead have the type, `TFinalType`.  
 * @template {AbstractModel} TTransformingModel
 * Type to recurse through to augment.
 * @template TFinalType
 * Type to augment SQL primitive types (non `AbstractModel` types) to.
 * @typedef {{[K in keyof TTransformingModel]-?: TTransformingModel[K] extends (infer U extends AbstractModel)[]|undefined ? AugmentModel<U, TFinalType> : TTransformingModel[K] extends (AbstractModel|undefined) ? AugmentModel<TTransformingModel[K], TFinalType> : TFinalType}} AugmentModel
 */

/*****************************STRINGS******************************/

/** Contains
 * Checks if the given string type, `K`, contains `TContainer`, and if so, returns `K`, otherwise it returns `never`.
 * @template {string|symbol|number} K
 * @template {string} TContainer
 * @typedef {K extends `${infer A}${TContainer}${infer B}` ? K : never} Contains
 */

/** StartsWith
 * Checks if the given string type, `K`, begins with `TStarter`, and if so, returns `K`, otherwise it returns `never`.
 * @template {string|symbol|number} K
 * @template {string} TStarter
 * @typedef {K extends `${TStarter}${infer A}` ? K : never} StartsWith
 */

/** Join
 * Recursively joins all nested objects keys to get a union of all combinations of strings with each key. 
 * @template {AbstractModel} T
 * @template {keyof T & string} [TKey=keyof T & string]
 * @typedef {undefined extends T 
 *      ? never 
 *      : T[TKey] extends (infer R extends AbstractModel)[]|undefined 
 *          ? T extends T[TKey] 
 *              ? never 
 *              : `${TKey}_${Join<R>}` 
 *          : T[TKey] extends AbstractModel|undefined 
 *              ? `${TKey}_${Join<T[TKey]>}` 
 *              : never} Join
 */

/** Car
 * Grabs the first element in the String, separated by "_".
 * @template {string|symbol|number} K
 * @typedef {K extends `${infer A}_${infer B}` ? A : K} Car
 */

/** Cdr
 * Grabs the remaining elements in the String, separated by "_".
 * @template {string|symbol|number} K
 * @typedef {K extends `${infer B}_${infer A}` ? A : never} Cdr
 */

/*****************************SUPERFICIAL******************************/

// Superficial types are used to help TypeScript create a much more intuitive type in the end.
// Since MyORM is constructed using Proxies, many of the return types are only ever used internally. This may make development harder,
// but it makes it where we can influence the typing in whatever direction we want. With this power, the final results that the User should only see
// would be more accurate than if we were to not use superficial types.

// All types that use the following types should be prepended with 'Spf' for better communication that it is a Superficial type.
//   the comment describing the type should describe what is actually returned.

/** AugmentAllValues
 * Augments the type, `T`, so that all nested keys have some reflection of their parent name. (e.g., { Foo: { Bar: "" } } becomes { Foo: { Foo_Bar: "" } } )
 * @template {AbstractModel} T
 * @template {string} [Pre=``]
 * @typedef {{[K in keyof T]-?: T[K] extends (infer R extends AbstractModel)[]|undefined 
 *   ? AugmentAllValues<R, `${Pre}${K & string}_`> 
 *   : T[K] extends AbstractModel|undefined 
 *     ? AugmentAllValues<T[K], `${Pre}${K & string}_`> 
 *     : `${Pre}${K & string}`}} AugmentAllValues
 */

/** ReconstructObject
 * Transforms a string or union thereof that resembles some finitely nested properties inside of `TOriginal` model 
 * into its actual representation as shown in `TOriginal`. 
 * @template {AbstractModel} TOriginal
 * @template {string|symbol|number} TSerializedKey
 * @typedef {Contains<TSerializedKey, "_"> extends never 
 *   ? TSerializedKey extends keyof TOriginal 
 *     ? {[K in TSerializedKey]: TOriginal[TSerializedKey]} 
 *     : never
 *   : {[K in Car<TSerializedKey> as K extends keyof TOriginal ? K : never]: K extends keyof TOriginal 
 *     ? TOriginal[K] extends (infer R extends AbstractModel)[]|undefined
 *       ? ReconstructObject<R, Cdr<TSerializedKey>> 
 *       : TOriginal[K] extends AbstractModel|undefined
 *         ? ReconstructObject<Exclude<TOriginal[K], undefined>, Cdr<TSerializedKey>> 
 *         : TOriginal[K]
 *     : never} 
 * } ReconstructObject
 */

/** ReconstructAbstractModel
 * Transforms an object, `T`, with non-object value properties where each property key can be mapped back to `TOriginal` using {@link ReconstructValue<TOriginal, keyof T>}
 * @template {AbstractModel} TOriginal
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as StartsWith<K, "$">]: number} & ReconstructObject<TOriginal, keyof T>} ReconstructAbstractModel
 */

/*****************************WHERE******************************/

/** WhereChain
 * @typedef {"WHERE"|"WHERE NOT"|"AND"|"AND NOT"|"OR"|"OR NOT"} WhereChain 
 */

/** WhereCondition
 * @typedef {"="|"<>"|"<"|">"|"<="|">="|"IN"|"LIKE"} WhereCondition 
 */

/** WhereClausePropertyArray
 * @typedef {[WhereClauseProperty, ...(WhereClauseProperty|WhereClausePropertyArray)[]]} WhereClausePropertyArray 
 */

/** WhereClauseProperty
 * @typedef {object} WhereClauseProperty
 * @prop {string} property
 * @prop {WhereChain} chain
 * @prop {MaybeArray<SQLPrimitive>} value
 * @prop {WhereCondition} condition
 */

/*****************************GROUP BY******************************/

/** GroupByClauseProperty
 * @typedef {Column & { aggregate?: "AVG"|"COUNT"|"MIN"|"MAX"|"SUM"|"TOTAL" }} GroupByClauseProperty
 */

/** GroupedColumnsModel
 * Model representing grouped models, including aggregates.
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof Partial<TTableModel>]: GroupByClauseProperty}
 *  & Partial<{ $total: GroupByClauseProperty }>
 *  & Partial<{[K in keyof TTableModel as `$count_${Join<TTableModel, K & string>}`]: GroupByClauseProperty}>
 *  & Partial<{[K in keyof TTableModel as `$avg_${Join<TTableModel, K & string>}`]: GroupByClauseProperty}>
 *  & Partial<{[K in keyof TTableModel as `$max_${Join<TTableModel, K & string>}`]: GroupByClauseProperty}>
 *  & Partial<{[K in keyof TTableModel as `$min_${Join<TTableModel, K & string>}`]: GroupByClauseProperty}>
 *  & Partial<{[K in keyof TTableModel as `$sum_${Join<TTableModel, K & string>}`]: GroupByClauseProperty}>} GroupedColumnsModel
 */

/** Aggregates
 * Object representing the `aggregate` object passed into the `.groupBy` callback function.
 * @typedef {Object} Aggregates
 * @prop {() => "$total"} total Gets the total count of all records from the query.
 * @prop {AggrCountCallback} count Gets the count of distinct rows for that field.
 * @prop {AggrAvgCallback} avg Gets the average amount across all rows for that field.
 * @prop {AggrMaxCallback} max Gets the maximum amount between all rows for that field.
 * @prop {AggrMinCallback} min Gets the minimum amount between all rows for that field.
 * @prop {AggrSumCallback} sum Gets the total sum amount across all rows for that field.
 */

/** AggrCountCallback
 * @typedef {import('./util.js').AggrCountCallback} AggrCountCallback 
 */

/** AggrAvgCallback
 * @typedef {import('./util.js').AggrAvgCallback} AggrAvgCallback 
 */

/** AggrMaxCallback
 * @typedef {import('./util.js').AggrMaxCallback} AggrMaxCallback 
 */

/** AggrMinCallback
 * @typedef {import('./util.js').AggrMinCallback} AggrMinCallback 
 */

/** AggrSumCallback
 * @typedef {import('./util.js').AggrSumCallback} AggrSumCallback 
 */

/** SpfGroupByCallbackModel
 * Model parameter that is passed into the callback function for `.groupBy`.  
 * 
 * __NOTE: This is a superficial type to help augment the AliasModel of the context so Users can expect different results in TypeScript.__  
 * __Real return value: {@link GroupByClauseProperty}__
 * @template {AbstractModel} TTableModel
 * @typedef {AugmentAllValues<TTableModel>} SpfGroupByCallbackModel
 */

/*****************************SORT BY******************************/

/** SortByClauseProperty
 * @typedef {Column & { direction: "ASC"|"DESC"}} SortByClauseProperty
 */

/** SortByCallbackModelProp
 * @typedef {object} SortByCallbackModelProp
 * @prop {() => SortByClauseProperty} asc
 * @prop {() => SortByClauseProperty} desc
 */

/** SortByCallbackModel
 * @template {AbstractModel} T
 * @typedef {AugmentModel<T, SortByCallbackModelProp>} SortByCallbackModel
 */

/*****************************SERIALIZATION******************************/

/** SerializationQueryHandlerData
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

/*****************************EXECUTION******************************/

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

/*****************************ADAPTER******************************/

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
 * @template T
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

// MySQL adapter @TODO move to own repo.

/** @type {InitializeAdapterCallback<{ a: string }>} */
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
const ctx = new MyORMContext(adapter({ a: "" }), "Blah");
ctx.sortBy(m => m.foo.a.asc());
ctx.groupBy((m, aggr) => [aggr.count(m.foo.a), m.x]).select().then(results => {
    results[0]
});