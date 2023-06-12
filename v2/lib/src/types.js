//@ts-check


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

/*****************************RELATIONSHIPS******************************/

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
 * @prop {{[fieldName: string]: DescribedSchema}} schema
 * Various information about the table's columns.
 * @prop {Record<string, Relationship>=} relationships
 * Further configured relationships that will be on this table.
 */

/** From  
 * 
 * Object containing the `.fromTable()` function for real table name as it appears in the database.
 * @template {AbstractModel} TFrom
 * Relating table that is configuring the relationship.
 * @template {AbstractModel} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ fromTable: (realTableName: string) => WithKeys<TFrom, TTo> & WithPrimary<TFrom, TTo> }} From
 */

/** WithPrimary  
 * 
 * Object containing the `.withPrimary()` function for specifying the primary key.
 * @template {AbstractModel} TFrom
 * Relating table that is configuring the relationship.
 * @template {AbstractModel} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ withPrimary: (primaryKey: keyof OnlyNonAbstractModels<TFrom>) => { withForeign: (foreignKey: keyof OnlyNonAbstractModels<TTo>) => AndThatHasCallbacks<TTo>}}} WithPrimary
 */

/** WithKeys  
 * 
 * Object containing the `.withKeys()` function for specifying both primary and foreign keys.
 * @template {AbstractModel} TFrom
 * Relating table that is configuring the relationship.
 * @template {AbstractModel} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ withKeys: (primaryKey: keyof OnlyNonAbstractModels<TFrom>, foreignKey: keyof OnlyNonAbstractModels<TTo>) => AndThatHasCallbacks<TTo>}} WithKeys
 */

/** From_WithPrimary_WithKeys
 * 
 * A blend of the 3 types, `From`, `WithPrimary`, `WithKeys`.
 * @template {AbstractModel} TFrom
 * Relating table that is configuring the relationship.
 * @template {AbstractModel} TTo
 * The table that is being configured as a relationship with.
 * @typedef {From<TFrom, TTo> & WithPrimary<TFrom, TTo> & WithKeys<TFrom, TTo>} From_WithPrimary_WithKeys
 */

/** AndThatHasCallbacks  
 * 
 * Object containing the functions, `.andThatHasOne()` and `.andThatHasMany()` to further configure deeper relationships.
 * @template {AbstractModel} TTo
 * The table that is being configured as a relationship with.
 * @typedef {{ andThatHasOne: (callback: HasOneCallback<TTo>) => AndThatHasCallbacks<TTo>, andThatHasMany: (callback: HasManyCallback<TTo>) => AndThatHasCallbacks<TTo> }} AndThatHasCallbacks
 */

/** HasOneCallbackModel  
 * 
 * Model that is passed to the callback that the user provides which gives context to the tables to configure relationships with.
 * @template {AbstractModel} TTableModel
 * Table model type that is being configured as a relationship.
 * @typedef {{[K in keyof OnlyAbstractModels<TTableModel>]: From_WithPrimary_WithKeys<TTableModel, OnlyAbstractModels<TTableModel>[K]>}} HasOneCallbackModel
 */

/** HasOneCallback  
 * 
 * The callback template that is used by the user to configure one to one relationships.
 * @template {AbstractModel} TTableModel
 * Table model type that is being configured as a relationship.
 * @callback HasOneCallback
 * @param {HasOneCallbackModel<TTableModel>} model
 * The model that provides context for the user to configure their relationships with.
 * @returns {void}
 */

/** HasManyCallbackModel  
 * 
 * Model that is passed to the callback that the user provides which gives context to the tables to configure relationships with.
 * @template {AbstractModel} TTableModel
 * Table model type that is being configured as a relationship.
 * @typedef {{[K in keyof OnlyAbstractModelArrays<TTableModel>]: From_WithPrimary_WithKeys<TTableModel, OnlyAbstractModelArrays<TTableModel>[K]>}} HasManyCallbackModel
 */

/** HasManyCallback  
 * 
 * The callback template that is used by the user to configure one to many relationships.
 * @template {AbstractModel} TTableModel
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
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof import("./types.js").OnlyAbstractModelTypes<TTableModel>]: IncludeClauseProperty}} IncludedColumnsModel
 */

/** ThenIncludeCallback  
 * 
 * 
 * @template {AbstractModel} TTableModel
 * @template {string|symbol|number} TLastKey
 * @typedef {{ thenInclude: (model: IncludeCallback<TTableModel, TLastKey>) => ThenIncludeCallback<TTableModel, TLastKey> }} ThenIncludeCallback
 */

/** IncludeCallback  
 * 
 * 
 * @template {AbstractModel} TTableModel
 * @template {string|symbol|number} TLastKey
 * @typedef {(model: {[K in keyof import('./types.js').OnlyAbstractModelTypes<TTableModel>]: ThenIncludeCallback<import('./types.js').OnlyAbstractModelTypes<TTableModel>[K], K>}) => void} IncludeCallback
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
 * @prop {string} table
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
 * @prop {string[]} columns
 * @prop {SQLPrimitive[][]} values
 */

/** SerializationUpdateHandlerData  
 * 
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

/** SerializationDeleteHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize a delete command.
 * @typedef {object} SerializationDeleteHandlerData
 * @prop {WhereClausePropertyArray=} where
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
 * @prop {(table: string) => { cmd: string, args: ExecutionArgument[] }} forDescribe
 * Handles serialization of a describe command and its arguments so it appropriately works for the given database connector.
 */

/** ExecutionHandlers  
 * 
 * Various handlers for the `MyORMAdapter` to handle execution of a command and the command's corresponding arguments.
 * @typedef {object} ExecutionHandlers
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<any[]>} forQuery
 * Handles execution of a query command, given the command string and respective arguments for the comamnd string.  
 * This should return an array of objects where each object represents the row returned from the query.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forCount
 * Handles the execution of a query for `COUNT` command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows retrieved from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number[]>} forInsert
 * Handles execution of an insert command, given the command string and respective arguments for the comamnd string.
 * This should return an array of numbers, where each number represents a table's primary key's auto incremented number (if applicable)  
 * This array should be parallel with the array of records that were serialized in the `serialize(...).forInsert()` function.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forUpdate
 * Handles execution of an update command, given the command string and respective arguments for the comamnd string.
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<number>} forDelete
 * Handles execution of a delete command, given the command string and respective arguments for the comamnd string.
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: ExecutionArgument[]) => MaybePromise<{[fieldName: string]: DescribedSchema}>} forDescribe
 * Handles execution of a describe command, given the command string and respective arguments for the comamnd string.
 * This should return a Set containing {@link DescribedSchema} objects. __NOTE: `table` and `alias` can be left as empty strings, as they are handled internally in MyORM anyways.__
 */

/** AdapterScope  
 * 
 * @typedef {object} AdapterScope
 * @prop {() => Error} MyORMAdapterError
 * @prop {any} Where
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
 * 
 * @template T
 * @typedef {object} MyORMAdapter
 * @prop {AdapterOptions} options
 * @prop {AdapterSyntax} syntax
 * @prop {(scope: AdapterScope) => ExecutionHandlers} execute
 * @prop {(scope: AdapterScope) => SerializationHandlers} serialize
 */

/** InitializeAdapterCallback  
 * 
 * 
 * @template T
 * Type of the expected argument that needs to be passed into the `adapter()` function that represents the connection to the source.
 * @callback InitializeAdapterCallback
 * @param {T} config
 * @returns {MyORMAdapter<T>}
 */


/** MaybePromise  
 * 
 * @template T @typedef {Promise<T> | T} MaybePromise 
 */

/**
 * @typedef {{[key: string]: object|SQLPrimitive|AbstractModel|AbstractModel[]}} AbstractModel
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel`s.
 * @template {AbstractModel} T 
 * The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends (AbstractModel[]|undefined) ? never : T[K] extends AbstractModel|undefined ? K : never]-?: T[K] extends (AbstractModel[]|undefined) ? never : T[K] extends AbstractModel|undefined ? Exclude<T[K], undefined> : never}} OnlyAbstractModels
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` arrays.
 * @template {AbstractModel} T 
 * The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends (AbstractModel[]|undefined) ? K : never]-?: T[K] extends (infer R extends AbstractModel)[]|undefined ? Required<R> : never}} OnlyAbstractModelArrays
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` or `AbstractModel` arrays.
 * @template {AbstractModel} T 
 * The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)]: (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)[K]}} OnlyAbstractModelTypes
 */

/**
 * Removes all keys where the value in `T` for that key is of type `AbstractModel` or `AbstractModel[]`
 * @template {AbstractModel} T 
 * The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof T as T[K] extends AbstractModel[]|AbstractModel|undefined ? never : K]: T[K]}} OnlyNonAbstractModels
 */

/**
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

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback SuccessHandler
 * @param {OnSuccessData} data 
 * Data that was passed from the event emission.
 */

/**
 * Data passed into the `OnFail` functions so the User has context to metadata during a command execution when it has failed.
 * @typedef OnFailData
 * @prop {Error} error 
 * Thrown error
 * @prop {string} dateIso 
 * Date in ISO string format
 * @prop {string} cmdRaw 
 * Command in its raw format, including arguments.
 * @prop {string} cmdSanitized 
 * Command in its sanitized format.
 * @prop {string} cmd 
 * Command in its sanitized format.
 * @prop {any[]} args 
 * Arguments that were passed in with the sanitized format.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command and that command fails.
 * @callback FailHandler
 * @param {OnFailData} data 
 * Data that was passed from the event emission.
 */

/**
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

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback WarningHandler
 * @param {OnSuccessData} data 
 * Data that was passed from the event emission.
 */

/**
 * Model parameter that is passed into the callback function for `.groupBy`
 * @template {AbstractModel} TTableModel
 * @typedef {AugmentAllValues<TTableModel>} GroupByCallbackModel
 */

/**
 * Configuration representing an object storing data for a view's state.
 * @template {AbstractModel} TTableModel
 * @typedef {object} ViewConfig
 * @prop {import('./where-builder.js').WhereBuilder<TTableModel>?} where
 * @prop {(string|number)=} limit
 * @prop {(string|number)=} offset
 * @prop {SortByKeyConfig[]} sortBy
 * @prop {string[]?} groupBy
 * @prop {Partial<{[K in keyof OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, primaryKey: keyof TTableModel, foreignKey: string, type: "1:1"|"1:n" }}>=} includes
 * @prop {((m: any) => any)|undefined} aliasCallback
 * @prop {((m: any) => any)|null} mapBack
 */

/**
 * Callback for the argument in `.sortBy`
 * @template {AbstractModel} TTableModel
 * @callback SortByCallback
 * @param {SortByCallbackConfig<TTableModel>} model
 * @returns {SortByKeyConfig|SortByKeyConfig[]}
 */

/**
 * Model used in `SortByCallback`.
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? SortByCallbackConfig<Required<T>> : TTableModel[K] extends AbstractModel|undefined ? SortByCallbackConfig<Required<TTableModel[K]>> : SortByKeyConfig & DirectionCallbacks}} SortByCallbackConfig
 */

/**
 * Model representing an object for how a column is sorted.
 * @typedef {object} SortByKeyConfig
 * @prop {string} column
 * @prop {"ASC"|"DESC"} direction
 */

/**
 * Directions that can be used on a key in `.sortBy`.
 * @typedef {object} DirectionCallbacks
 * @prop {() => SortByKeyConfig} asc
 * @prop {() => SortByKeyConfig} ascending
 * @prop {() => SortByKeyConfig} desc
 * @prop {() => SortByKeyConfig} descending
 */

/**
 * Makes all keys on `TTableModel` and any keys that are in nested in `TTableModel` into required keys.
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? AllKeysRequired<Required<T>> : TTableModel[K] extends AbstractModel|undefined ? AllKeysRequired<Required<TTableModel[K]>> : TTableModel[K]}} AllKeysRequired
 */

/**
 * Recursively makes all immediate properties that are of non-primitive types (anything that isn't an object or object array) required on `TTableModel`
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof TTableModel as TTableModel[K] extends AbstractModel[]|AbstractModel|undefined ? never : K]:   TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? NonPrimitiveTypesAsRequired<T>[] : TTableModel[K] extends AbstractModel|undefined ? NonPrimitiveTypesAsRequired<TTableModel[K]> : TTableModel[K]} 
 *         & {[K in keyof TTableModel as TTableModel[K] extends AbstractModel[]|AbstractModel|undefined ? K : never]-?: TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? NonPrimitiveTypesAsRequired<T>[] : TTableModel[K] extends AbstractModel|undefined ? NonPrimitiveTypesAsRequired<TTableModel[K]> : TTableModel[K]}
 * } NonPrimitiveTypesAsRequired
 */

/**
 * Makes all immediate properties that are of non-primitive types (anything that isn't an object or object array) optional on `TTableModel`.
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof TTableModel as TTableModel[K] extends AbstractModel[]|AbstractModel|undefined ? never : K]: TTableModel[K]} & {[K in keyof TTableModel as TTableModel[K] extends AbstractModel[]|AbstractModel|undefined ? K : never]?: TTableModel[K]}} NonPrimitiveTypesAsOptional
 */

// WHERE BUILDER TYPES

/**
 * Recursively nested array of T generic types.
 * @template T
 * @typedef {(T|RecursiveArray<T>)[]} RecursiveArray
 */

/**
 * Object to chain AND and OR conditions onto a WHERE clause.
 * @template {AbstractModel} TTableModel
 * @template {AbstractModel} [TOriginalModel=TTableModel]
 * @typedef {Object} Chain
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} and 
 * Apply an AND chain to your WHERE clause.
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} or 
 * Apply an OR chain to your WHERE clause.
 */

/**
 * @template {AbstractModel} TTableModel
 * @template {AbstractModel} [TOriginalModel=TTableModel]
 * @callback ChainCallback
 * @param {ChainObject<TTableModel, TOriginalModel>} model
 * @returns {any}
 */

/**
 * @template {AbstractModel} TTableModel
 * @template {AbstractModel} [TOriginalModel=TTableModel]
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? ChainObject<Required<T>, TOriginalModel> : TTableModel[K] extends AbstractModel|undefined ? ChainObject<Exclude<TTableModel[K], undefined>, TOriginalModel> : import('./where-builder.js').WhereBuilder<TOriginalModel, K extends symbol ? never : K>}} ChainObject
 */

/**
 * Function definition for every type of condition to be created in a WHERE clause.
 * @template {AbstractModel} TTableModel
 * @template {keyof TTableModel} TColumn
 * @callback Condition
 * @param {undefined extends TTableModel[TColumn] ? TTableModel[TColumn]|null : TTableModel[TColumn]} value
 * Value of the same type of the column being worked on to check the condition against.
 * @returns {Chain<TTableModel>}
 * A group of methods for optional chaining of conditions.
 */

/** 
 * Function used to help initialize building a WHERE clause.
 * @template {AbstractModel} TTableModel 
 * @typedef {(m: {[K in keyof TTableModel]: import('./where-builder.js').WhereBuilder<TTableModel, K>}) => void} WhereBuilderFunction 
 */

/**
 * Types of chains that can exist between each condition.
 * @typedef {"WHERE"|"OR"|"AND"|"WHERE NOT"|"OR NOT"|"AND NOT"} Chains 
 */

/**
 * Condition configuration used to assist in building WHERE clauses.
 * @template {AbstractModel} TTableModel
 * @typedef {Object} ConditionConfig
 * @prop {number} depth
 * @prop {Chains} chain
 * @prop {keyof TTableModel} property
 * @prop {"="|"<>"|"<"|">"|"<="|">="|"LIKE"|"IN"|"IS"|"IS NOT"} operator
 * @prop {string|number|boolean|Date|string[]|number[]|boolean[]|Date[]|null} value
 */

export const Types = {};