//@ts-check
import { MyORMInternalError } from "./exceptions.js";
import { deepCopy } from "./util.js";
import { Where, WhereBuilder } from "./where-builder.js";

/**
 * @typedef {{[key: string]: SQLPrimitive|AbstractModel|AbstractModel[]}} AbstractModel
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
 * @prop {SelectClauseProperty[]} select
 * @prop {[Omit<Omit<FromClauseProperty, "targetTableKey">, "sourceTableKey">, ...FromClauseProperty[]]} from
 * @prop {GroupByClauseProperty[]=} groupBy
 * @prop {SortByClauseProperty[]=} sortBy
 * @prop {number=} limit
 * @prop {number=} offset
 * @prop {WhereBuilder=} where
 * @prop {boolean=} explicit
 * @prop {boolean=} negated
 * @prop {Record<string, Set<DescribedSchema>>} relationships
 */

/**
 * @template {AbstractModel} TTableModel
 * @template {AbstractModel} [TAliasModel=import('./types.js').OnlyNonAbstractModels<TTableModel>]
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
            select: [],
            from: [{
                table,
                alias: table
            }],
            relationships: {}
        }

        this.#promise = this.#describe(table).then(schema => {
            this.#schema = schema;
        })
    }

    /**
     * @template {SelectedColumnsModel<TTableModel>|TAliasModel} [TSelectedColumns=TAliasModel]
     * **Used internally**  
     * Assists with reconstructing the final return type.
     * @param {((model: SpfSelectCallbackModel<TTableModel>) => keyof TSelectedColumns|(keyof TSelectedColumns)[])=} modelCallback
     * Used to choose which columns to retrieve from the query.  
     * If nothing is specified, the original aliased representation will be returned.  
     * If a GROUP BY clause has been specified, an error will be thrown.
     * @returns {Promise<(TSelectedColumns extends TAliasModel ? TAliasModel : ReconstructAbstractModel<TTableModel, TSelectedColumns>)[]>}
     */
    async select(modelCallback=undefined) {
        if(modelCallback) {
            if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');
            const selects = /** @type {SelectClauseProperty|SelectClauseProperty[]}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            this.#state.select = Array.isArray(selects) ? selects : [selects];
        }

        const scope = { MyORMAdapterError: () => Error(), Where };
        const { cmd, args } = this.#adapter.serialize(scope).forQuery({
            select: this.#state.select,
            from: this.#state.from,
            //@ts-ignore `._getConditions` is marked private so the User does not see the function.
            where: this.#state.where?._getConditions(),
            group_by: this.#state.groupBy,
            order_by: this.#state.sortBy,
            limit: this.#state.limit,
            offset: this.#state.offset
        });
        const results = this.#adapter.execute(scope).forQuery(cmd, args);
        return [];
    }

    async insert(records) {

    }

    async update(records) {

    }

    async delete(records) {

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
                    if(ctx.#state.where) {
                        //@ts-ignore `._append` is marked private so the User does not see the function.
                        return ctx.#state.where._append(p, `AND${this.#state.negated ? ' NOT' : ''}`);
                    }
                    return Where(p, table, this.#state.relationships, `WHERE${this.#state.negated ? ' NOT' : ''}`);
                }
            });

            this.#state.where = modelCallback(newProxy());
            this.#state.negated = false;
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
            const sorts = modelCallback(this.#newProxyForColumn(undefined, undefined, o => ({
                ...o,
                direction: "ASC",
                asc: () => ({ ...o, direction: "ASC" }),
                desc: () => ({ ...o, direction: "DESC" })
            })));

            ctx.#state.sortBy = Array.isArray(sorts) ? sorts : [sorts];
        });
    }

    sort = this.sortBy;

    /**
     * @template {GroupedColumnsModel<TTableModel>} TGroupedColumns
     * @param {(model: SpfGroupByCallbackModel<TTableModel>, aggregates: Aggregates) => keyof TGroupedColumns|(keyof TGroupedColumns)[]} modelCallback 
     * @returns {MyORMContext<ReconstructAbstractModel<TTableModel, TGroupedColumns>, ReconstructAbstractModel<TTableModel, TGroupedColumns>>} 
     * A new context with the all previously configured clauses and the updated groupings.
     */
    groupBy(modelCallback) {
        return this.#duplicate(ctx => {
            /**
             * 
             * @param {"AVG"|"COUNT"|"MIN"|"MAX"|"SUM"|"TOTAL"} aggr
             * @returns {(col?: any) => any} 
             */
            const getGroupedColProp = (aggr) => {
                return (col) => {
                    if(col === undefined) throw new MyORMInternalError();
                    const { table, column, alias } = /** @type {Column} */ (col);
                    const c = aggr === 'COUNT' 
                        ? `COUNT(DISTINCT ${column})` 
                        : aggr === 'TOTAL' 
                            ? `COUNT(*)` 
                            : `${aggr}(${column})`;
                    return {
                        table,
                        column: c,
                        alias: alias.replace('<|', '_'),
                        aggregate: aggr
                    }
                };
            };

            const groups = modelCallback(this.#newProxyForColumn(), {
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

    /**
     * Specify the columns you would like to select
     * @template {SelectedColumnsModel<TTableModel>} TSelectedColumns
     * @param {(model: SpfSelectCallbackModel<TTableModel>) => keyof TSelectedColumns|(keyof TSelectedColumns)[]} modelCallback
     * @returns {MyORMContext<ReconstructAbstractModel<TTableModel, TSelectedColumns>, ReconstructAbstractModel<TTableModel, TSelectedColumns>>} 
     * A new context with the all previously configured clauses and the updated groupings.
     */
    choose(modelCallback) {
        if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');

        return this.#duplicate(ctx => {
            const selects = /** @type {SelectClauseProperty|SelectClauseProperty[]}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            ctx.#state.select = Array.isArray(selects) ? selects : [selects];
        });
    }

    columns = this.choose;

    /**
     * Duplicates this context which would expect to have further updates using the `callback` argument.  
     * 
     * Use this function to maintain a desired state between each context.
     * @param {(ctx: MyORMContext<any, any>) => void} callback 
     * Callback that is used to further configure state after the duplication has occurred.
     * @returns {any}
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
        return this.#duplicate(ctx => {
            // @TODO use `table` and have a recursively nested relationships Set, so names do not have to be unique.
            const newProxy = (table=this.#table) => new Proxy(/** @type {any} */({}), {
                get: (t,p,r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                    if (this.#isRelationship(p)) throw Error(`No more than one relationship can exist with the name, "${p}".`);
                    
                    this.#describe(p).then(schema => {
                        this.#state.relationships[p] = schema;
                    });

                    const andThatHasOne = {
                        thenInclude: (callback) => {
                            callback(newProxy(p));
                            return andThatHasOne;
                        }
                    };
                    return andThatHasOne;
                }
            });

            modelCallback(newProxy());
        });
    }

    hasMany(modelCallback) {

    }

    /** @template {AbstractModel} T @typedef {import("./types.js").OnlyAbstractModelTypes<T>} OAMT */

    /**
     * @template {AbstractModel} TTableModel
     * @template {string|symbol|number} TLastKey
     * @typedef {{ thenInclude: (model: IncludeCallback<TTableModel, TLastKey>) => ThenIncludeCallback<TTableModel, TLastKey>, z: TLastKey }} ThenIncludeCallback
     */

    /**
     * @template {AbstractModel} TTableModel
     * @template {string|symbol|number} TLastKey
     * @typedef {(model: {[K in keyof OAMT<TTableModel>]: ThenIncludeCallback<OAMT<TTableModel>[K], K>}) => void} IncludeCallback
     */

    /**
     * 
     * Specify the columns you would like to select
     * @template {IncludedColumnsModel<TTableModel>} TIncludedColumn
     * @param {(model: {[K in keyof OAMT<TTableModel>]: ThenIncludeCallback<OAMT<TTableModel>[K], K>}) => { thenInclude: unknown, z: keyof TIncludedColumn }} modelCallback
     * @returns {MyORMContext<TTableModel, TAliasModel & {[K in keyof TIncludedColumn as K extends keyof TTableModel ? K : never]: Exclude<TTableModel[K], undefined>}>} 
     * A new context with the all previously configured clauses and the updated groupings.
     */
    include(modelCallback) {
        return this.#duplicate(ctx => {
            const newProxy = (table=this.#table, prepend="") => new Proxy(/** @type {any} */({}), {
                get: (t,p,r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                    if (!this.#isRelationship(p)) throw Error('');
                    
                    const thisKey = Array.from(this.#state.relationships[table]).filter(k => k.isPrimary)[0];
                    const thatKey = Array.from(this.#state.relationships[p]).filter(k => k.isPrimary)[0];
                    this.#state.from.push({
                        table: p,
                        alias: `__${prepend}${table}_${p}__`,
                        sourceTableKey: {
                            table: this.#adapter.syntax.escapeTable(table),
                            column: this.#adapter.syntax.escapeColumn(thisKey.field),
                            alias: this.#adapter.syntax.escapeTable(thisKey.alias)
                        },
                        targetTableKey: {
                            table: this.#adapter.syntax.escapeTable(p),
                            column: this.#adapter.syntax.escapeColumn(thatKey.field),
                            alias: this.#adapter.syntax.escapeTable(thatKey.alias)
                        }
                    });

                    const thenInclude = {
                        thenInclude: (callback) => {
                            callback(newProxy(p, `${prepend}${table}_`));
                            return thenInclude;
                        }
                    };
                    return thenInclude;
                }
            });

            modelCallback(newProxy());
        });
    }

    join = this.include;

    /**
     * @param {string=} table 
     * @param {string=} prepend 
     * @param {((o: Column) => any)=} callback
     * @returns {any}
     */
    #newProxyForColumn(table = this.#table, prepend='', callback=(o) => o){
        if(table === undefined) table = this.#table;
        if(prepend === undefined) prepend = '';
        return new Proxy({}, {
            get: (t, p, r) => {
                if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                if (this.#isRelationship(p)) {
                    return this.#newProxyForColumn(p, `${prepend}${table}|>`, callback);
                }

                return callback({
                    table: this.#adapter.syntax.escapeTable(table),
                    column: this.#adapter.syntax.escapeColumn(p),
                    alias: this.#adapter.syntax.escapeColumn(`${prepend}${p}`)
                });
            }
        });
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

    /**
     * Negate the next WHERE clause.
     */
    get not() {
        this.#state.negated = false;
        return this;
    }
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
 * @prop {string} alias
 * The given alias for MyORM to use. (this is handled internally.)
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
 * Augments the type, `T`, so that all nested properties have string values reflecting their own key and their parent(s).  
 * (e.g., { Foo: { Bar: "" } } becomes { Foo: { Bar: "Foo_Bar" } })
 * @template {AbstractModel} T
 * @template {string} [TPre=``]
 * @template {string} [TSeparator=`_`]
 * @typedef {{[K in keyof T]-?: T[K] extends (infer R extends AbstractModel)[]|undefined 
 *   ? AugmentAllValues<R, `${TPre}${K & string}${TSeparator}`> 
 *   : T[K] extends AbstractModel|undefined 
 *     ? AugmentAllValues<T[K], `${TPre}${K & string}${TSeparator}`> 
 *     : `${TPre}${K & string}`}} AugmentAllValues
 */

/** AugmentAllKeys  
 * Augments the type, `T`, so that all nested properties have keys reflecting their own key and their parent(s).  
 * (e.g., { Foo: { Bar: "" } } becomes { Foo_Bar: "" })
 * @template {AbstractModel} T
 * @template {string} [TPre=``]
 * @template {string} [TSeparator=`_`]
 * @typedef {{[K in keyof T as T[K] extends (infer R extends AbstractModel)[]|undefined 
 *   ? keyof AugmentAllKeys<R, `${TPre}${K & string}${TSeparator}`> 
 *   : T[K] extends AbstractModel|undefined 
 *     ? keyof AugmentAllKeys<T[K], `${TPre}${K & string}${TSeparator}`> 
 *     : `${TPre}${K & string}`]-?: T[K]}} AugmentAllKeys
 */

/** ReconstructObject  
 * 
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
 * 
 * Transforms an object, `T`, with non-object value properties where each property key can be mapped back to `TOriginal` 
 * using {@link ReconstructValue<TOriginal, keyof T>}
 * @template {AbstractModel} TOriginal
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as StartsWith<K, "$">]: number} & ReconstructObject<TOriginal, keyof T>} ReconstructAbstractModel
 */

/*****************************INCLUDE******************************/

/** IncludeClauseProperty  
 * 
 * Object to carry data tied to various information about a column being selected.
 * @typedef {FromClauseProperty} IncludeClauseProperty
 */

/** IncludedColumnsModel  
 * 
 * Model representing selected columns.
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof import("./types.js").OnlyAbstractModelTypes<TTableModel>]: IncludeClauseProperty}} IncludedColumnsModel
 */


/*****************************WHERE******************************/

/** WhereChain
 * @typedef {"WHERE"|"WHERE NOT"|"AND"|"AND NOT"|"OR"|"OR NOT"} WhereChain 
 */

/** WhereCondition
 * @typedef {"="|"<>"|"<"|">"|"<="|">="|"IN"|"LIKE"} WhereCondition 
 */

/** WhereClausePropertyArray  
 * 
 * @typedef {[WhereClauseProperty, ...(WhereClauseProperty|WhereClausePropertyArray)[]]} WhereClausePropertyArray 
 */

/** WhereClauseProperty  
 * 
 * @typedef {object} WhereClauseProperty
 * @prop {string} property
 * @prop {WhereChain} chain
 * @prop {MaybeArray<SQLPrimitive>} value
 * @prop {WhereCondition} condition
 */

/*****************************SELECT******************************/

/** SelectClauseProperty
 * Object to carry data tied to various information about a column being selected.
 * @typedef {Column} SelectClauseProperty
 */

/** SelectedColumnsModel  
 * 
 * Model representing selected columns.
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof Partial<TTableModel> as Join<TTableModel, K & string>]: SelectClauseProperty}} SelectedColumnsModel
 */

/** SpfSelectCallbackModel  
 * 
 * Model parameter that is passed into the callback function for `.select`.  
 * 
 * __NOTE: This is a superficial type to help augment the AliasModel of the context so Users can expect different results in TypeScript.__  
 * __Real return value: {@link SelectClauseProperty}__
 * @template {AbstractModel} TTableModel
 * @typedef {AugmentAllValues<TTableModel>} SpfSelectCallbackModel
 */

/*****************************GROUP BY******************************/

/** GroupByClauseProperty  
 * 
 * Object to carry data tied to various information about a column being grouped by.
 * @typedef {Column & { aggregate?: "AVG"|"COUNT"|"MIN"|"MAX"|"SUM"|"TOTAL" }} GroupByClauseProperty
 */

/** GroupedColumnsModel  
 * 
 * Model representing grouped columns, including aggregates.
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
 * If undefined, then no `WHERE` clause was given.
 * @prop {number=} limit
 * Number representing the number of records to grab.  
 * If undefined, then no `LIMIT` clause was given.
 * @prop {number=} offset
 * Number representing the number of records to skip before grabbing.  
 * If undefined, then no `OFFSET` clause was given.
 * @prop {SortByClauseProperty[]=} order_by
 * Array of objects where each object represents a column to order by.  
 * If undefined, then no `ORDER BY` clause was given.
 * @prop {GroupByClauseProperty[]=} group_by
 * Array of objects where each object represents a column to group by.  
 * If undefined, then no `GROUP BY` clause was given.
 * @prop {SelectClauseProperty[]} select
 * Array of objects where each object represents a column to select.
 * @prop {[Omit<Omit<FromClauseProperty, "targetTableKey">, "sourceTableKey">, ...FromClauseProperty[]]} from
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
                    const [main, ...fromJoins] = from;
                    
                    cmd += `SELECT ${select.map(prop => `${prop.table}.${prop.column} AS ${prop.alias}`).join('\n\t\t,')}`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    cmd += `FROM ${main.table} AS ${main.alias}`;
                    // if a limit or offset was specified, and an join is expected, then a nested query should take place of the first table.
                    if(limit && from.length > 1) {
                        let main;
                        [main, ...from] = from;
                        cmd += `(SELECT * FROM ${main.table} ${handleWhere(where, main.table).cmd} ${limitStr} ${offsetStr}) AS ${from[0].alias}`;
                    }
                    
                    cmd += fromJoins.map(table => `${table.table} AS ${table.alias} ON ${table.sourceTableKey.table}.${table.sourceTableKey.alias} = ${table.targetTableKey.table}.${table.targetTableKey.alias}`).join('\n\t\tLEFT JOIN');
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
 * @prop {Bar=} bar
 */

/**
 * @typedef {object} Foo
 * @prop {number} a
 * @prop {string} b
 * @prop {boolean} c
 * @prop {Bar=} bar
 */

/**
 * @typedef {object} Bar
 * @prop {number} d
 * @prop {string} e
 * @prop {boolean} f
 * @prop {Biz=} biz
 */

/**
 * @typedef {object} Biz
 * @prop {number} g
 */

/** @type {MyORMContext<TestModel>} */
const ctx = new MyORMContext(adapter({ a: "" }), "Blah");

ctx.select(m => m.x).then(r => {
    r[0]
});

ctx.choose(m => m.x).select().then(r => {
    r[0]
})