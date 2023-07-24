//@ts-check

/** This file holds all definitions of the types that are used within the library. */

/** SqlTable  
 * 
 * Used to declare a model that represents a table within your database.
 * @typedef {{[key: string]: object|import('./schema').ScalarDataType|SqlTable|SqlTable[]}} SqlTable
 */

/** MaybeArray  
 * 
 * @template T
 * @typedef {T|T[]} MaybeArray
 */

/** ExecutionArgument  
 * 
 * @typedef {import('./schema').ScalarDataType|{ value: import('./schema').ScalarDataType, varName: string }} ExecutionArgument
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
 * 
 * @typedef {object} FromClauseProperty
 * @prop {string} table
 * @prop {string} alias
 * @prop {SelectClauseProperty} sourceTableKey
 * @prop {SelectClauseProperty} targetTableKey
 */

/** AugmentModel  
 * 
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
 * 
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
 * @prop {{[K in keyof T]: import('./schema').DescribedSchema}} schema
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
 * @typedef {(model: {[K in keyof OnlySqlTableTypes<TTableModel>]: ThenIncludeCallback<OnlySqlTableTypes<TTableModel>[K], K>}) => void} IncludeCallback
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
 * @prop {MaybeArray<import('./schema').ScalarDataType|null>} value
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

/*****************************WHERE BUILDER******************************/

/** Chain
 * 
 * Object to chain AND and OR conditions onto a WHERE clause.
 * @template {SqlTable} TTableModel
 * @template {SqlTable} [TOriginalModel=TTableModel]
 * @typedef {Object} Chain
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} and 
 * Apply an AND chain to your WHERE clause.
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} or 
 * Apply an OR chain to your WHERE clause.
 */

/** ChainCallback
 * 
 * @template {SqlTable} TTableModel
 * @template {SqlTable} [TOriginalModel=TTableModel]
 * @callback ChainCallback
 * @param {ChainObject<TTableModel, TOriginalModel>} model
 * @returns {any}
 */

/** ChainObject
 * 
 * @template {SqlTable} TTableModel
 * @template {SqlTable} [TOriginalModel=TTableModel]
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends SqlTable)[]|undefined ? ChainObject<Required<T>, TOriginalModel> : TTableModel[K] extends SqlTable|undefined ? ChainObject<Exclude<TTableModel[K], undefined>, TOriginalModel> : import('./where-builder.js').WhereBuilder<TOriginalModel, K extends symbol ? never : K>}} ChainObject
 */

/** Condition
 * 
 * Function definition for every type of condition to be created in a WHERE clause.
 * @template {SqlTable} TTableModel
 * @template {keyof TTableModel} TColumn
 * @callback Condition
 * @param {undefined extends TTableModel[TColumn] ? TTableModel[TColumn]|null : TTableModel[TColumn]} value
 * Value of the same type of the column being worked on to check the condition against.
 * @returns {Chain<TTableModel>}
 * A group of methods for optional chaining of conditions.
 */

/** WhereBuilderFunction 
 * 
 * Function used to help initialize building a WHERE clause.
 * @template {SqlTable} TTableModel 
 * @typedef {(m: {[K in keyof TTableModel]: import('./where-builder.js').WhereBuilder<TTableModel, K>}) => void} WhereBuilderFunction 
 */

/*****************************ADAPTER******************************/

/** SerializationQueryHandlerData  
 * 
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

/** SerializationInsertHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize an insert command.
 * @typedef {object} SerializationInsertHandlerData
 * @prop {string} table
 * @prop {string[]} columns
 * @prop {import('./schema').ScalarDataType[][]} values
 */

/** SerializationUpdateHandlerExplicitData  
 * 
 * Object model type for data used in explicit update transactions.
 * @typedef {object} SerializationUpdateHandlerExplicitData
 * @prop {SqlTable} values Used in an `explicit transaction`.  
 * Object representing what columns will be updated from the command.  
 * If this is undefined, then `objects` should be used.
 */

/** SerializationUpdateHandlerImplicitData  
 * 
 * Object model type for data used in implicit update transactions.
 * @typedef {object} SerializationUpdateHandlerImplicitData
 * @prop {SqlTable[]} objects Used in an `implicit transaction`.  
 * Array of objects that represent the table in the context that should be updated from the command.
 * If this is undefined, then `updateObject` should be used.  
 * __NOTE: If the table has an identity key, then the primary key will be stripped out before being passed into the execution handler function.__
 * @prop {string[]} primaryKeys
 * Primary key of the table.
 */

/** SerializationUpdateHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize an update command.
 * @typedef {object} SerializationUpdateHandlerData
 * @prop {string} table
 * Table the update is occurring on.
 * @prop {string[]} columns
 * Columns to be updated.  
 * @prop {WhereClausePropertyArray} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 * @prop {SerializationUpdateHandlerExplicitData=} explicit
 * @prop {SerializationUpdateHandlerImplicitData=} implicit
 */

/** SerializationDeleteHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize a delete command.
 * @typedef {object} SerializationDeleteHandlerData
 * @prop {string} table
 * Table the delete is occurring on.
 * @prop {WhereClausePropertyArray=} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 */

/** SerializationTruncateHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize a delete command.
 * @typedef {object} SerializationTruncateHandlerData
 * @prop {string} table
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 */

/** SerializationHandlers  
 * 
 * Various handlers for the `MyORMAdapter` to handle serialization of `MyORM` built data into appropriate command strings.
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
 * @prop {(data: SerializationTruncateHandlerData) => { cmd: string, args: ExecutionArgument[] }} forTruncate
 * Handles serialization of a truncate command and its arguments so it appropriately works for the given database connector.
 * @prop {(table: string) => { cmd: string, args: ExecutionArgument[] }} forDescribe
 * Handles serialization of a describe command and its arguments so it appropriately works for the given database connector.
 * @prop {(table: string) => { cmd: string, args: ExecutionArgument[] }} forConstraints
 * Handles serialization of a command that gets information about a table's constraints to other tables.
 */

/** ExecutionHandlers  
 * 
 * Various handlers for the `MyORMAdapter` to handle execution of a command and the command's corresponding arguments.
 * @typedef {object} ExecutionHandlers
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<any[]>} forQuery
 * Handles execution of a query command, given the command string and respective arguments for the command string.  
 * This should return an array of objects where each object represents the row returned from the query.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forCount
 * Handles the execution of a query for `COUNT` command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows retrieved from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number[]>} forInsert
 * Handles execution of an insert command, given the command string and respective arguments for the command string.  
 * This should return an array of numbers, where each number represents a table's primary key's auto incremented number (if applicable)  
 * This array should be parallel with the array of records that were serialized in the `serialize(...).forInsert()` function.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forUpdate
 * Handles execution of an update command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forDelete
 * Handles execution of a delete command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forTruncate
 * Handles execution of a truncate command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<{[fieldName: string]: import('./schema').DescribedSchema}>} forDescribe
 * Handles execution of a describe command, given the command string and respective arguments for the command string.
 * This should return an object containing {@link import('./schema').DescribedSchema} objects. 
 * __NOTE: `table` and `alias` can be left as empty strings, as they are handled internally in MyORM anyways.__
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<ConstraintData[]>} forConstraints
 * Handles execution of a command that retrieves constraint data about a table, given the command string and respective arguments for the command string.
 * This should return an array containing {@link ConstraintData} objects.
 */

/** AdapterWhereHandler  
 * 
 * Reduces all of the conditions built in `MyORM` to a single clause.
 * @callback AdapterWhereHandler
 * @param {WhereClausePropertyArray=} conditions
 * Conditions to reduce to a clause.
 * @param {string=} table
 * If specified, will only reduce conditions that belong to the specified table. (default: empty string or all conditions)
 * @param {((n: number) => string)=} sanitize
 * Function used to convert values to sanitized strings. (default: (n) => `?`.)
 * @returns {{cmd: string, args: SQLPrimitive[]}}
 * string and array of SQL primitives to be concatenated onto the full query string and arguments.
 */

/** AdapterScope  
 * 
 * Scope passed into the Adapter for usage within any of the serialize/execute functions.
 * @typedef {object} AdapterScope
 * @prop {(message: string) => import('./exceptions.js').MyORMAdapterError} MyORMAdapterError  
 * Throw an error if it is an unexpected error that occurs within the custom adapter.
 * @prop {{ NON_UNIQUE_KEY: () => import('./exceptions.js').MyORMNonUniqueKeyError }} ErrorTypes
 * Various Error types that should be thrown when a certain event happens.
 * @prop {typeof import('./where-builder.js').Where} Where
 * Situationally create new WHERE clause conditions.
 */

/** AdapterOptions  
 * 
 * Additional options that can be restricted specifically for the adapter's use.
 * @typedef {object} AdapterOptions
 * @prop {boolean=} allowTruncation
 * Allow the user to truncate the table.
 * @prop {boolean=} allowUpdateAll
 * Allow the user to update all records in the table.
 * @prop {boolean=} eventHandling 
 * Allow the user to attach event handlers to the table.
 */

/** AdapterSyntax  
 * 
 * Tools to assist with the adapter's syntax of how commands should be serialized.
 * @typedef {object} AdapterSyntax
 * @prop {(s: string) => string} escapeTable
 * Escapes a table in the command to protect against SQL injections.
 * `s` is the table to escape.
 * @prop {(s: string) => string} escapeColumn
 * Escapes a column in the command to protect against SQL injections.  
 * `s` is the column to escape.
 */

/** MyORMAdapter  
 * 
 * Object model type representing the requirements for an adapter to work with `MyORM`.
 * @template T
 * Type of the expected argument that needs to be passed into the `adapter()` function that represents the connection to the source.
 * @typedef {object} MyORMAdapter
 * @prop {AdapterOptions} options
 * Additional options that are automatically set over `MyORM`'s defaults.
 * @prop {AdapterSyntax} syntax
 * Required functions in order to provide safe SQL serialization.
 * @prop {(scope: AdapterScope) => ExecutionHandlers} execute
 * Function that provides the {@link AdapterScope} `scope` and returns an object of various functions for {@link ExecutionHandlers}.
 * @prop {(scope: AdapterScope) => SerializationHandlers} serialize
 * Function that provides the {@link AdapterScope} `scope` and returns an object of various functions for {@link SerializationHandlers}.
 */

/** InitializeAdapterCallback  
 * 
 * Callback for the initialization of the adapter connection for a specific database adapter.
 * @template T
 * Type of the expected argument that needs to be passed into the `adapter()` function that represents the connection to the source.
 * @callback InitializeAdapterCallback
 * @param {T} config
 * Configuration that belongs to `T` which initializes the connection to the database.
 * @returns {MyORMAdapter<T>}
 * Adapter configuration that is to be used within `MyORM`.
 */

export const Types = {};