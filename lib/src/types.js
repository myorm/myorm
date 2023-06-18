//@ts-check

/** SQLPrimitive
 * @typedef {boolean|string|number|Date|bigint} SQLPrimitive
 */

/** SqlTable  
 * 
 * Used to declare a model that represents a table within your database.
 * @typedef {{[key: string]: object|SQLPrimitive|SqlTable|SqlTable[]}} SqlTable
 * @example
 * ```ts
 * import type { SqlTable } from "@myorm/myorm";
 * interface Foo implements SqlTable {
 *   FooId?: number;
 *   BarId: number;
 *   ColumnA: number;
 *   ColumnB: string;
 *   Bar?: Bar;
 * };
 * 
 * interface Bar implements SqlTable {
 *   BarId?: number;
 *   ColumnC: boolean;
 * };
 * ```
 */

/** MaybeArray
 * @template T
 * @typedef {T|T[]} MaybeArray
 */

/** ExecutionArgument
 * @typedef {SQLPrimitive|{ value: SQLPrimitive, varName: string }} ExecutionArgument
 */

/** Column
 * @typedef {object} Column
 * @prop {string} table
 * Table the column belongs to (escaped)
 * @prop {string} column
 * Column of the table (escaped)
 * @prop {string} alias
 * Alias of the column (escaped)
 * @prop {string=} aliasUnescaped
 * Alias of the column in its raw unescaped form.
 */

/** FromClauseProperty
 * @typedef {object} FromClauseProperty
 * @prop {string} table
 * @prop {string} alias
 * @prop {SelectClauseProperty} sourceTableKey
 * @prop {SelectClauseProperty} targetTableKey
 */

/** AugmentModel
 * Augments the given type, `TTransformingModel` so that all of its non `SqlTable` property types
 * (including nested properties within `SqlTable` type properties) instead have the type, `TFinalType`.
 * @template {SqlTable} TTransformingModel
 * Type to recurse through to augment.
 * @template TFinalType
 * Type to augment SQL primitive types (non `SqlTable` types) to.
 * @typedef {{[K in keyof TTransformingModel]-?: TTransformingModel[K] extends (infer U extends SqlTable)[]|undefined ? AugmentModel<U, TFinalType> : TTransformingModel[K] extends (SqlTable|undefined) ? AugmentModel<TTransformingModel[K], TFinalType> : TFinalType}} AugmentModel
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
 * @template {SqlTable} T
 * @template {keyof T & string} [TKey=keyof T & string]
 * @typedef {undefined extends T
 *      ? never
 *      : T[TKey] extends (infer R extends SqlTable)[]|undefined
 *          ? T extends T[TKey]
 *              ? never
 *              : `${TKey}_${Join<R>}`
 *          : T[TKey] extends SqlTable|undefined
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
 * @template {SqlTable} T
 * @template {string} [TPre=``]
 * @template {string} [TSeparator=`_`]
 * @typedef {{[K in keyof T]-?: T[K] extends (infer R extends SqlTable)[]|undefined 
 *   ? AugmentAllValues<R, `${TPre}${K & string}${TSeparator}`> 
 *   : T[K] extends SqlTable|undefined 
 *     ? AugmentAllValues<T[K], `${TPre}${K & string}${TSeparator}`> 
 *     : `${TPre}${K & string}`}} AugmentAllValues
 */

/** ReconstructObject  
 * 
 * Transforms a string or union thereof that resembles some finitely nested properties inside of `TOriginal` model 
 * into its actual representation as shown in `TOriginal`. 
 * @template {SqlTable} TOriginal
 * @template {string|symbol|number} TSerializedKey
 * @typedef {Contains<TSerializedKey, "_"> extends never 
 *   ? TSerializedKey extends keyof TOriginal 
 *     ? {[K in TSerializedKey]: TOriginal[TSerializedKey]} 
 *     : never
 *   : {[K in Car<TSerializedKey> as K extends keyof TOriginal ? K : never]: K extends keyof TOriginal 
 *     ? TOriginal[K] extends (infer R extends SqlTable)[]|undefined
 *       ? ReconstructObject<R, Cdr<TSerializedKey>> 
 *       : TOriginal[K] extends SqlTable|undefined
 *         ? ReconstructObject<Exclude<TOriginal[K], undefined>, Cdr<TSerializedKey>> 
 *         : TOriginal[K]
 *     : never} 
 * } ReconstructObject
 */

/** ReconstructSqlTable  
 * 
 * Transforms an object, `T`, with non-object value properties where each property key can be mapped back to `TOriginal` 
 * using {@link ReconstructValue<TOriginal, keyof T>}
 * @template {SqlTable} TOriginal
 * @template {SqlTable} T
 * @typedef {{[K in keyof T as StartsWith<K, "$">]: number} & ReconstructObject<TOriginal, keyof T>} ReconstructSqlTable
 */

/*****************************RELATIONSHIPS******************************/

/** ConstraintData  
 * 
 * @typedef {object} ConstraintData
 * @prop {string} name
 * @prop {string} table
 * @prop {string} column
 * @prop {string} refTable
 * @prop {string} refColumn
 */

/** DescribedSchema  
 * 
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

/** Relationship  
 * 
 * Object model type representing a relationship between tables.
 * @template {SqlTable} T
 * Information regarding a relating table.
 * @typedef {object} Relationship
 * @prop {"1:1"|"1:n"} type
 * Type of relationship this has.
 * @prop {string} table
 * Actual table name as it appears in the database.
 * @prop {string} alias
 * Alias given to this table for command serialization.
 * @prop {Column} primary
 * Information on the key pointing to the original table that holds this relationship.
 * @prop {Column} foreign 
 * Information on the key pointing to the related table. (this key comes from the same table that is specified by `table`)
 * @prop {{[K in keyof T]: DescribedSchema}} schema
 * Various information about the table's columns.
 * @prop {Record<string, Relationship<T>>=} relationships
 * Further configured relationships that will be on this table.
 * @prop {ConstraintData[]} constraints
 * Constraints that exist on the parent table to this table.
 */

/** From  
 * 
 * Object containing the `.fromTable()` function for real table name as it appears in the database.
 * @template {SqlTable} TFrom
 * Relating table that is configuring the relationship.
 * @template {SqlTable} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ fromTable: (realTableName: string) => WithKeys<TFrom, TTo> & WithPrimary<TFrom, TTo> }} From
 */

/** WithPrimary  
 * 
 * Object containing the `.withPrimary()` function for specifying the primary key.
 * @template {SqlTable} TFrom
 * Relating table that is configuring the relationship.
 * @template {SqlTable} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ withPrimary: (primaryKey: keyof OnlyNonSqlTables<TFrom>) => { withForeign: (foreignKey: keyof OnlyNonSqlTables<TTo>) => AndThatHasCallbacks<TTo>}}} WithPrimary
 */

/** WithKeys  
 * 
 * Object containing the `.withKeys()` function for specifying both primary and foreign keys.
 * @template {SqlTable} TFrom
 * Relating table that is configuring the relationship.
 * @template {SqlTable} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ withKeys: (primaryKey: keyof OnlyNonSqlTables<TFrom>, foreignKey: keyof OnlyNonSqlTables<TTo>) => AndThatHasCallbacks<TTo>}} WithKeys
 */

/** From_WithPrimary_WithKeys
 * 
 * A blend of the 3 types, `From`, `WithPrimary`, `WithKeys`.
 * @template {SqlTable} TFrom
 * Relating table that is configuring the relationship.
 * @template {SqlTable} TTo
 * The table that is being configured as a relationship with.
 * @typedef {From<TFrom, TTo> & WithPrimary<TFrom, TTo> & WithKeys<TFrom, TTo>} From_WithPrimary_WithKeys
 */

/** AndThatHasCallbacks  
 * 
 * Object containing the functions, `.andThatHasOne()` and `.andThatHasMany()` to further configure deeper relationships.
 * @template {SqlTable} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ andThatHasOne: (callback: HasOneCallback<TTo>) => AndThatHasCallbacks<TTo>, andThatHasMany: (callback: HasManyCallback<TTo>) => AndThatHasCallbacks<TTo> }} AndThatHasCallbacks
 */

/** HasOneCallbackModel  
 * 
 * Model that is passed to the callback that the user provides which gives context to the tables to configure relationships with.
 * @template {SqlTable} TTableModel
 * Table model type that is being configured as a relationship.
 * @typedef {{[K in keyof OnlySqlTables<TTableModel>]: From_WithPrimary_WithKeys<TTableModel, OnlySqlTables<TTableModel>[K]>}} HasOneCallbackModel
 */

/** HasOneCallback  
 * 
 * The callback template that is used by the user to configure one to one relationships.
 * @template {SqlTable} TTableModel
 * Table model type that is being configured as a relationship.
 * @callback HasOneCallback
 * @param {HasOneCallbackModel<TTableModel>} model
 * The model that provides context for the user to configure their relationships with.
 * @returns {void}
 */

/** HasManyCallbackModel  
 * 
 * Model that is passed to the callback that the user provides which gives context to the tables to configure relationships with.
 * @template {SqlTable} TTableModel
 * Table model type that is being configured as a relationship.
 * @typedef {{[K in keyof OnlySqlTableArrays<TTableModel>]: From_WithPrimary_WithKeys<TTableModel, OnlySqlTableArrays<TTableModel>[K]>}} HasManyCallbackModel
 */

/** HasManyCallback  
 * 
 * The callback template that is used by the user to configure one to many relationships.
 * @template {SqlTable} TTableModel
 * Table model type that is being configured as a relationship.
 * @callback HasManyCallback
 * @param {HasManyCallbackModel<TTableModel>} model
 * The model that provides context for the user to configure their relationships with.
 * @returns {void}
 */

/** IncludeClauseProperty  
 * 
 * Object to carry data tied to various information about a column being selected.
 * @typedef {FromClauseProperty} IncludeClauseProperty
 */

/** IncludedColumnsModel  
 * 
 * Model representing included columns on the table.
 * @template {SqlTable} TTableModel
 * @typedef {{[K in keyof import("./types.js").OnlySqlTableTypes<TTableModel>]: IncludeClauseProperty}} IncludedColumnsModel
 */

/** ThenIncludeCallback  
 * 
 * 
 * @template {SqlTable} TTableModel
 * @template {string|symbol|number} TLastKey
 * @typedef {{ thenInclude: (model: IncludeCallback<TTableModel, TLastKey>) => ThenIncludeCallback<TTableModel, TLastKey> }} ThenIncludeCallback
 */

/** IncludeCallback  
 * 
 * 
 * @template {SqlTable} TTableModel
 * @template {string|symbol|number} TLastKey
 * @typedef {(model: {[K in keyof import('./types.js').OnlySqlTableTypes<TTableModel>]: ThenIncludeCallback<import('./types.js').OnlySqlTableTypes<TTableModel>[K], K>}) => void} IncludeCallback
 */

/*****************************WHERE******************************/

/** WhereChain  
 * @typedef {"WHERE"|"WHERE NOT"|"AND"|"AND NOT"|"OR"|"OR NOT"} WhereChain 
 */

/** WhereCondition  
 * @typedef {"="|"<>"|"<"|">"|"<="|">="|"IN"|"LIKE"|"IS"|"IS NOT"|"BETWEEN"} WhereCondition 
 */

/** WhereClausePropertyArray  
 * 
 * @typedef {[WhereClauseProperty, ...(WhereClauseProperty|WhereClausePropertyArray)[]]} WhereClausePropertyArray 
 */

/** WhereClauseProperty  
 * 
 * @typedef {object} WhereClauseProperty
 * @prop {string} table
 * @prop {string} property
 * @prop {WhereChain} chain
 * @prop {MaybeArray<SQLPrimitive|null>} value
 * @prop {WhereCondition} operator
 */

/*****************************SELECT******************************/

/** SelectClauseProperty  
 * Object to carry data tied to various information about a column being selected.
 * @typedef {Column} SelectClauseProperty
 */

/** SelectedColumnsModel  
 * 
 * Model representing selected columns.
 * @template {SqlTable} TTableModel
 * @typedef {{[K in keyof Partial<TTableModel> as Join<TTableModel, K & string>]: SelectClauseProperty}} SelectedColumnsModel
 */

/** SpfSelectCallbackModel  
 * 
 * Model parameter that is passed into the callback function for `.select`.  
 * 
 * __NOTE: This is a superficial type to help augment the AliasModel of the context so Users can expect different results in TypeScript.__  
 * __Real return value: {@link SelectClauseProperty}__
 * @template {SqlTable} TTableModel
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
 * @template {SqlTable} TTableModel
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
 * @template {SqlTable} TTableModel
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
 * @template {SqlTable} T
 * @typedef {AugmentModel<T, SortByCallbackModelProp>} SortByCallbackModel
 */

/** MaybePromise  
 * 
 * Unionizes T with the Promise of T.
 * @template T @typedef {Promise<T> | T} MaybePromise 
 */

/** OnlySqlTables  
 * 
 * Filters out an object model type to only have keys that are valued with `SqlTable`s.
 * @template {SqlTable} T 
 * The abstract model to check properties for recursive `SqlTable`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends (SqlTable[]|undefined) ? never : T[K] extends SqlTable|undefined ? Date extends T[K] ? never : K : never]-?: T[K] extends (SqlTable[]|undefined) ? never : T[K] extends SqlTable|undefined ? Exclude<T[K], undefined> : never}} OnlySqlTables
 */

/** OnlySqlTableArrays  
 * 
 * Filters out an object model type to only have keys that are valued with `SqlTable` arrays.
 * @template {SqlTable} T 
 * The abstract model to check properties for recursive `SqlTable`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends (SqlTable[]|undefined) ? K : never]-?: T[K] extends (infer R extends SqlTable)[]|undefined ? Required<R> : never}} OnlySqlTableArrays
 */

/** OnlySqlTableTypes  
 * Filters out an object model type to only have keys that are valued with `SqlTable` or `SqlTable` arrays.
 * @template {SqlTable} T 
 * The abstract model to check properties for recursive `SqlTable`s.
 * @typedef {{[K in keyof (OnlySqlTables<T> & OnlySqlTableArrays<T>)]: (OnlySqlTables<T> & OnlySqlTableArrays<T>)[K]}} OnlySqlTableTypes
 */

/** OnlyNonSqlTables  
 * 
 * Removes all keys where the value in `T` for that key is of type `SqlTable` or `SqlTable[]`
 * @template {SqlTable} T 
 * The abstract model to check properties for recursive `SqlTable`s.
 * @typedef {{[K in keyof T as T[K] extends SqlTable[]|SqlTable|undefined ? Date extends T[K] ? K : never : K]: T[K]}} OnlyNonSqlTables
 */

/** OnSuccessData  
 * 
 * Data passed into the `OnSuccess` functions so the User has context to metadata during a command execution when it is successful.
 * @typedef OnSuccessData
 * @prop {number?} affectedRows 
 * Number of affected rows
 * @prop {string} dateIso 
 * Date in ISO string format
 * @prop {string} cmdRaw 
 * Command in its raw format, including arguments.
 * @prop {string} cmdSanitized 
 * Command in its sanitized format.
 * @prop {any[]} args 
 * Arguments that were passed in with the sanitized format.
 * @prop {any[]?} resultsInSqlRowFormat
 * Results directly from the adapter, or otherwise SQL rows
 */

/** OnFailData  
 * 
 * Data passed into the `OnFail` functions so the User has context to metadata during a command execution when it has failed.
 * @typedef OnFailData
 * @prop {Error} error 
 * Thrown error
 * @prop {string} dateIso 
 * Date in ISO string format
 * @prop {string=} cmdRaw 
 * Command in its raw format, including arguments.
 * @prop {string=} cmdSanitized 
 * Command in its sanitized format.
 * @prop {any[]=} args 
 * Arguments that were passed in with the sanitized format.
 */

/** OnWarningData  
 * 
 * Data passed into the `OnWarning` functions so the User has context to metadata from a command executed outside expected conditions.
 * @typedef OnWarningData
 * @prop {string} dateIso 
 * Date in ISO string format
 * @prop {string} type 
 * Type of command executed
 * @prop {string} table
 * Table the command was executed on.
 * @prop {string} message
 * Message from MyORM
 */

// WHERE BUILDER TYPES

/**
 * Object to chain AND and OR conditions onto a WHERE clause.
 * @template {SqlTable} TTableModel
 * @template {SqlTable} [TOriginalModel=TTableModel]
 * @typedef {Object} Chain
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} and 
 * Apply an AND chain to your WHERE clause.
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} or 
 * Apply an OR chain to your WHERE clause.
 */

/**
 * @template {SqlTable} TTableModel
 * @template {SqlTable} [TOriginalModel=TTableModel]
 * @callback ChainCallback
 * @param {ChainObject<TTableModel, TOriginalModel>} model
 * @returns {any}
 */

/**
 * @template {SqlTable} TTableModel
 * @template {SqlTable} [TOriginalModel=TTableModel]
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends SqlTable)[]|undefined ? ChainObject<Required<T>, TOriginalModel> : TTableModel[K] extends SqlTable|undefined ? ChainObject<Exclude<TTableModel[K], undefined>, TOriginalModel> : import('./where-builder.js').WhereBuilder<TOriginalModel, K extends symbol ? never : K>}} ChainObject
 */

/**
 * Function definition for every type of condition to be created in a WHERE clause.
 * @template {SqlTable} TTableModel
 * @template {keyof TTableModel} TColumn
 * @callback Condition
 * @param {undefined extends TTableModel[TColumn] ? TTableModel[TColumn]|null : TTableModel[TColumn]} value
 * Value of the same type of the column being worked on to check the condition against.
 * @returns {Chain<TTableModel>}
 * A group of methods for optional chaining of conditions.
 */

/** 
 * Function used to help initialize building a WHERE clause.
 * @template {SqlTable} TTableModel 
 * @typedef {(m: {[K in keyof TTableModel]: import('./where-builder.js').WhereBuilder<TTableModel, K>}) => void} WhereBuilderFunction 
 */

export const Types = {};