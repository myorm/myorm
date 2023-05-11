//@ts-check

/**
 * Contextual information on the command that is being worked on.
 * @typedef {object} CommandContext
 * @prop {string} mainTableName
 * Table name, as it appears in the database, that the context represents
 * @prop {string=} primaryKey
 * Key identified as the primary key for the table.
 * @prop {boolean} isIdentityKey
 * Key that has an "AUTO_INCREMENT" attribute applied to it.
 * @prop {boolean=} hasOneToOne
 * True if the command has a one-to-one relationship included on it.
 * @prop {boolean=} hasOneToMany
 * True if the command has a one-to-many relationship included on it.
 * @prop {boolean=} isCount
 * True if the command is a COUNT command.
 * @prop {boolean=} isExplicit
 * True if the command is an explicit transaction. (Utilizes the WHERE clause)
 */

/** 
 * Data required to execute a command.
 * @typedef {{ cmd: string, args: any[] }} CommandData 
 */

/** 
 * Built data for executing a query command.
 * @typedef {object} QueryData 
 * @prop {string[]} selects
 * All columns being queried.
 * @prop {string[]} from
 * All tables where columns are being queried from.
 * @prop {string=} where
 * Built command in the format of `{column} {condition} ? {chain}[...]`.
 * @prop {any[]=} whereArgs
 * All arguments used in the WHERE clause.
 * @prop {string[]=} groupBy
 * All columns that are specified to group as.
 * @prop {SortByKeyConfig[]=} orderBy
 * All columns that are specified order on.
 * @prop {(string|number)=} limit
 * Number representing the limit of how many records to query.
 * @prop {(string|number)=} offset
 * Number representing the offset of how many records to query.
 */

/** 
 * Built data for executing an insert command.
 * @typedef {object} InsertData
 * @prop {string[]} columns
 * Array of strings representing all columns being inserted of.
 * @prop {string[][]} values
 * Array of array of strings, where each array represents a parallel array of respective values with the `columns` array for a single record.
 * @prop {string=} where
 * Built command in the format of `{column} {condition} ? {chain}[...]`.
 * @prop {any[]=} whereArgs
 * All arguments used in the WHERE clause.
 */

/** 
 * Built data for executing an update command.
 * @typedef {object} UpdateData 
 * @prop {string[]} columns
 * Array of strings representing all columns being updated.
 * @prop {any[]=} records
 * Array of records being updated.
 * @prop {string=} where
 * WHERE clause string to send in.
 * @prop {any[]=} whereArgs
 * All arguments used in the WHERE clause.
 */

/** 
 * Built data for serializing a delete command, that is, the command should delete one or more records from the table.
 * @typedef {object} DeleteData
 * @prop {any[]=} records
 * Array of records being updated.
 * @prop {string=} where
 * WHERE clause string to send in.
 * @prop {any[]=} whereArgs
 * All arguments used in the WHERE clause.
 */

/**
 * Built data for serializing a `DESCRIBE` command, that is, the command should get essential information about the table.
 * @typedef {object} DescribeData
 * @prop {string} table
 * Table being described.
 */

/**
 * Built data for serializing aggregate columns 
 * @typedef {object} AggregateData
 * @prop {(col: string) => string} transformColForParamUse
 * Function to transform the column from the adapter's aggregate function into an appropriate column to add to the MySQL function call portion.
 * @prop {(col: string) => string} transformColForAliasUse
 * Function to transform the column from the adapter's aggregate function into an appropriate column to add to the alias portion.
 */

/**
 * Various functions for assisting with serialization of commands.
 * @typedef {object} SerializationConfig
 * @prop {(data: QueryData) => CommandData} forQuery 
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for querying the corresponding database.
 * @prop {(data: InsertData) => CommandData} forInsert 
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for inserting into the corresponding database.
 * @prop {(data: UpdateData) => CommandData} forUpdate
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for updating the corresponding database.
 * @prop {(data: DeleteData) => CommandData} forDelete
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for deleting from the corresponding database.
 * @prop {((data: DescribeData) => CommandData)} forDescribe
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for describing a table in the corresponding database.
 * @prop {(() => CommandData)} forTruncate
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for truncating a table in the corresponding database.
 * @prop {((data: InsertData) => CommandData)=} forUpsert
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for upserting into the corresponding database.
 * @prop {((data: AggregateData) => Aggregates)} forAggregates
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for usage of SQL aggregate functions.
 * 
 */

/**
 * Object representing all of the tools that may be used during serialization.
 * @template {AbstractModel} TTableModel
 * @typedef {object} OnSerializationTools
 * @prop {{ new(msg: string): import('./exceptions.js').MyORMSyntaxError }} MyORMError
 * Used to throw a MyORMSyntaxError whenever something appears wrong.
 * @prop {(primaryKey: keyof TTableModel, mainTableName: string, relationships: any) => import('./where-builder.js').WhereBuilder<TTableModel>} Where
 * Can be used to manually build a WHERE clause.
 * @prop {any} Schema
 * Schema that was queried about the table.
 * @prop {any} Relationships
 * Relationships that were configured and queried on the table.
 */

/** 
 * All functions and configurations required for a custom `MyORM` adapter.
 * @template {AbstractModel} TTableModel
 * @typedef {object} MyORMAdapter 
 * @prop {any} connection
 * The connection used within the context
 * @prop {(cmd: string, args: any[]|undefined) => Promise<TTableModel[]>} handleQuery 
 * Defines the behavior of how a query transaction is executed and passes the correct data back to MyORM.  
 * Should return an array of `TTableModel` objects. If no records exist, then an empty array should be returned.
 * @prop {(cmd: string, args: any[]|undefined) => Promise<number>} handleCount
 * Defines the behavior of how a query transaction for count is executed and passes the correct data back to MyORM.  
 * Should return a number, reflecting the COUNT(*) of the table given the clauses provided.
 * @prop {(cmd: string, args: any[]|undefined) => Promise<number[]>} handleInsert 
 * Defines the behavior of how an insert transaction is executed and passes the correct data back to MyORM. Should return an array of numbers for all insert ids.  
 * Should return an array of numbers, where the length of the array is equal to the number of records inserted. 
 * Each of these numbers will be the auto_increment primary key for each record.  
 * If not auto_increment primary key exists on the Table, then the return value does not matter.
 * @prop {(cmd: string, args: any[]|undefined) => Promise<number>} handleUpdate 
 * Defines the behavior of how an update transaction is executed and passes the correct data back to MyORM.  
 * Should return the number of affected rows, that is, the number of rows that were updated.
 * @prop {(cmd: string, args: any[]|undefined) => Promise<number>} handleDelete 
 * Defines the behavior of how a delete transaction is executed and passes the correct data back to MyORM.  
 * Should return the number of affected rows, that is, the number of rows that were deleted.
 * @prop {((cmd: string, args: any[]|undefined) => Promise<SchemaField[]>)} handleDescribe 
 * Defines the behavior of how a describe transaction is executed and passes the correct data back to MyORM.  
 * Should return an array of `SchemaField` objects that properly describe each column on the table. `Alias` is assigned internally.   
 * __NOTE: The field will be renamed to a sanitized format of itself with the table prepended to it.__
 * @prop {((cmd: string, args: any[]|undefined) => Promise<TTableModel[]>)=} handleUpsert 
 * Defines the behavior of how a replace transaction is executed and passes the correct data back to MyORM.  
 * Should return an array of `TTableModel` objects that were inserted/updated.
 * @prop {(tools: OnSerializationTools<TTableModel>, commandContext: CommandContext) => SerializationConfig} onSerialization 
 * Defines how certain transactions will be serialized into their correct format to be passed to the corresponding database.
 */

/**
 * Model representing a schema returned from `describe`.
 * @typedef {{Field: string, Type: string, Null: string, Key: string, Default: string, Extra: string, Alias: string}} SchemaField
 */

/**
 * Transforms an object's undefinable keys into optional keys.
 * @template T
 * @typedef {{[K in keyof T as undefined extends T[K] ? never : K]: UndefinedAsOptional<T[K]>} & {[K in keyof T as undefined extends T[K] ? K : never]?: T[K]}} UndefinedAsOptional
 */

/**
 * Returns a type, derived from `T`, where `V` is not in `T`.
 * @template T Type to filter out keys.
 * @template V Value types to filter out from `T`.
 * @template [WithNevers= {[K in keyof T]: Exclude<T[K], undefined> extends V ? never: (T[K] extends Record<string, unknown> ? Without<T[K], V> : T[K])}]
 * @typedef {Pick<WithNevers, {[K in keyof WithNevers]: WithNevers[K] extends never ? never : K}[keyof WithNevers]>} Without
 */

/**
 * Essentially a regular object, but only with string keys, used as a general representation of the Table being worked with.
 * @typedef {{[key: string]: any}} AbstractModel
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel`s.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends AbstractModel|undefined ? K : never]: Required<T[K]>}} OnlyAbstractModels
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends AbstractModel[]|undefined ? K : never]: T[K] extends (infer R extends AbstractModel)[]|undefined ? Required<R> : never}} OnlyAbstractModelArrays
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` or `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)]: (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)[K]}} OnlyAbstractModelTypes
 */

/**
 * Removes all keys where the value in `T` for that key is of type `AbstractModel` or `AbstractModel[]`
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {Omit<T, keyof {[K in keyof OnlyAbstractModelTypes<T> as OnlyAbstractModelTypes<T>[K] extends Date|undefined ? never : K]}>} OnlyNonAbstractModels
 */

/**
 * Callback definition for the `fromTable` function to help configure the Table name for an informal foreign relationship between two tables using `.include()`.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipFrom
 * @param {string} realTableName The real table name for the foreign table being configured.
 * @returns {RelationshipFromCallbackConfig<TFrom, TTo>} Chaining functions to further configure the relationship.
 */

/**
 * Functions for chaining after `.fromTable()` to further configure a relationship with its primary and foreign keys.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @typedef {object} RelationshipFromCallbackConfig
 * @prop {RelationshipWithKeys<TFrom, TTo>} withKeys Configures the entire relationship in one function, taking two arguments, `primaryKey` and `foreignKey`, both for the primary key and foreign key to join on, respectively
 * @prop {RelationshipWith<TFrom, TTo>} withPrimary Configures the primary key to join on in the relationship.
 */

/**
 * Callback definition for the `with` function to help configure the foreign key for the `TFrom` table.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipWith
 * @param {keyof TFrom} primaryKey Some column from `TFrom` that represents the primary key to use in this relationship.
 * @returns {RelationshipWithCallbackConfig<TFrom, TTo>} Chaining function `to` to further configure the relationship.
 */

/**
 * Functions for chaining after `.withPrimary()` to further configure a relationship with its foreign key.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @typedef {object} RelationshipWithCallbackConfig
 * @prop {RelationshipTo<TTo>} withForeign Configures the foreign key from the referenced object in `TTableModel` to use in this relationship.
 */

/**
 * Callback definition for the `to` function to help configure the foreign key for the `TTo` table.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipTo
 * @param {TTo extends undefined ? never : keyof TTo} foreignKey Some column from `TFrom` that represents the foreign key to use in this relationship.
 * @returns {AndThatHasCallbacks<TTo extends (infer T extends AbstractModel)[] ? T : TTo>} Further `andThatHas_` callbacks to configure nested relationships.
 */

/**
 * Configures a relationship's primary and foreign keys with the provided `primaryKey` and `foreignKey` arguments, respectively.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipWithKeys
 * @param {TFrom extends undefined ? never : keyof TFrom} primaryKey Some column from `TFrom` that represents the primary key to use in this relationship.
 * @param {TTo extends undefined ? never : keyof TTo} foreignKey Some column from `TFrom` that represents the foreign key to use in this relationship.
 * @returns {AndThatHasCallbacks<TTo extends (infer T extends AbstractModel)[] ? T : TTo>} Further `andThatHas_` callbacks to configure nested relationships.
 */

/**
 * Object that contains callbacks for configuring nested relationships with `TTableModel`.
 * @template {AbstractModel|AbstractModel[]} TTableModel Original `AbstractModel` table that just configured a relationship and may need configuration of cascaded relationships.
 * @typedef {object} AndThatHasCallbacks
 * @prop {(modelCallback: HasOneCallback<TTableModel>) => AndThatHasCallbacks<TTableModel>} andThatHasOne Further configures another one-to-one relationship with some `AbstractModel` in `TTableModel`.
 * @prop {(modelCallback: HasManyCallback<TTableModel>) => AndThatHasCallbacks<TTableModel>} andThatHasMany Further configures another one-to-many relationship with some `AbstractModel` in `TTableModel`.
 */

/**
 * Callback used for configuring a one-to-one relationship.
 * @template {AbstractModel} TTableModel
 * @callback HasOneCallback
 * @param {{[K in keyof Required<OnlyAbstractModels<TTableModel>>]: HasOneCallbackConfig<Required<TTableModel>, K>}} model Model that has `AbstractModel` types to configure a one-to-one relationship with `TTableModel`
 * @returns {void}
 */

/**
 * Callback used for configuring a one-to-many relationship.
 * @template {AbstractModel} TTableModel
 * @callback HasManyCallback
 * @param {{[K in keyof Required<OnlyAbstractModelArrays<TTableModel>>]: HasManyCallbackConfig<Required<TTableModel>, K>}} model Model that has `AbstractModel[]` types to configure a one-to-many relationship with `TTableModel`
 * @returns {void}
 */

/**
 * Object that contains callbacks for further configuring specific details about a one-to-one relationship.
 * @template {AbstractModel} TTableModel Table model object that is configuring a one-to-one relationship to.
 * @template {keyof OnlyAbstractModels<TTableModel>} Key Key of `TTableModel` where the value for `TTableModel[Key]` is of `AbstractModel` to configure the one-to-one relationship with.
 * @typedef {object} HasOneCallbackConfig
 * @prop {RelationshipFrom<TTableModel, OnlyAbstractModels<TTableModel>[Key]>} fromTable Configures the real table name that this relationship is from.
 * @prop {RelationshipWithKeys<TTableModel, OnlyAbstractModels<TTableModel>[Key]>} withKeys Configures the primary and foreign keys to use in this relationship.
 * @prop {RelationshipWith<TTableModel, OnlyAbstractModels<TTableModel>[Key]>} withPrimary Configures the primary key from `TTableModel` to use in this relationship.
 */

/**
 * Object that contains callbacks for further configuring specific details about a one-to-many relationship.
 * @template {AbstractModel} TTableModel Table model object that is configuring a one-to-many relationship to.
 * @template {keyof OnlyAbstractModelArrays<TTableModel>} Key Key of `TTableModel` where the value for `TTableModel[Key]` is of `AbstractModel[]` to configure the one-to-many relationship with.
 * @typedef {object} HasManyCallbackConfig
 * @prop {RelationshipFrom<TTableModel, OnlyAbstractModelArrays<TTableModel>[Key]>} fromTable Configures the real table name that this relationship is from.
 * @prop {RelationshipWithKeys<TTableModel, OnlyAbstractModelArrays<TTableModel>[Key]>} withKeys Configures the primary and foreign keys to use in this relationship.
 * @prop {RelationshipWith<TTableModel, OnlyAbstractModelArrays<TTableModel>[Key]>} withPrimary Configures the primary key from `TTableModel` to use in this relationship.
 */

/**
 * Object that has a `.thenInclude` function which will include another relationship from `TTableModel` into the next `MyORMContext` command that is sent.
 * @template {AbstractModel} TTableModel Table model object that possibly table relationships.
 * @typedef {object} ThenIncludeObject
 * @prop {(modelCallback: ThenIncludeCallbackConfig<TTableModel>) => ThenIncludeObject<TTableModel>} thenInclude Specifies that your next Query will further pull in another specified related table from the last included type from the database.
 * In order for your related record to be properly included, there needs to be a relationship configured using the `.andThatHasOne` or `.andThatHasMany` function.
 */

/**
 * Used in the `.thenInclude` function to properly get the keys of the table model being included.
 * @template {AbstractModel} TTableModel
 * @callback ThenIncludeCallbackConfig
 * @param {{[K in keyof Required<OnlyAbstractModelTypes<TTableModel>>]: ThenIncludeObject<Required<OnlyAbstractModelTypes<TTableModel>>[K]>}} model Model representing the table that is being included into the query.
 * @returns {void}
 */

/**
 * All of the options available to pass into the "options" argument in the constructor for MySqlTableContext.
 * @typedef {Object} TableContextOptions
 * @property {boolean=} allowUpdateOnAll Permit updating to all records in the Table.
 * @property {boolean=} allowTruncation Permit truncation of the Table.
 * @property {boolean=} sortKeys Sort keys before being inserted. This can possibly prevent any mangling of key/value pairs.
 */

/**
 * Data passed into the `OnSuccess` functions so the User has context to metadata during a command execution when it is successful.
 * @typedef OnSuccessData
 * @property {number?} affectedRows Number of affected rows
 * @property {string} dateIso Date in ISO string format
 * @property {string} cmdRaw Command in its raw format, including arguments.
 * @property {string} cmdSanitized Command in its sanitized format.
 * @property {any[]} args Arguments that were passed in with the sanitized format.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback SuccessHandler
 * @param {OnSuccessData} data Data that was passed from the event emission.
 */

/**
 * Data passed into the `OnFail` functions so the User has context to metadata during a command execution when it has failed.
 * @typedef OnFailData
 * @property {Error} error Error thrown by mysql2
 * @property {string} dateIso Date in ISO string format
 * @property {string} cmdRaw Command in its raw format, including arguments.
 * @property {string} cmdSanitized Command in its sanitized format.
 * @property {string} cmd Command in its sanitized format.
 * @property {any[]} args Arguments that were passed in with the sanitized format.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command and that command fails.
 * @callback FailHandler
 * @param {OnFailData} data Data that was passed from the event emission.
 */

/**
 * @template {AbstractModel} T
 * @template {string} [Pre=``]
 * @typedef {{[K in keyof T as `${Pre}${K & string}`]: T[K] extends (infer R extends AbstractModel)[]|undefined 
 *   ? AugmentAllKeys<R, `${K & string}_`> 
 *   : T[K] extends AbstractModel|undefined ? AugmentAllKeys<T[K], `${K & string}_`> : T[K]}} AugmentAllKeys
 */

/**
 * @template {AbstractModel} T
 * @template {string} [Pre=``]
 * @typedef {{[K in keyof T]: T[K] extends (infer R extends AbstractModel)[]|undefined 
 *   ? AugmentAllValues<R, `${Pre}${K & string}_`> 
 *   : T[K] extends AbstractModel|undefined 
 *     ? AugmentAllValues<T[K], `${Pre}${K & string}_`> 
 *     : `${Pre}${K & string}`}} AugmentAllValues
 */

/**
 * @template {string|symbol|number} K
 * @template {string} TStarter
 * @typedef {K extends `${TStarter}${infer A}` ? K : never} StartsWith
 */

/**
 * @template {string|symbol|number} K
 * @template {string} TEnder
 * @typedef {K extends `${infer A}${TEnder}` ? K : never} EndsWith
 */

/**
 * @template {string|symbol|number} K
 * @template {string} TContainer
 * @typedef {K extends `${infer A}${TContainer}${infer B}` ? K : never} Contains
 */

/**
 * Grab the first element in the String, separated by "_".
 * @template {string|symbol|number} K
 * @typedef {K extends `${infer A}_${infer B}` ? A : K} Car
 */

/**
 * Grab the remaining elements in the String, separated by "_".
 * @template {string|symbol|number} K
 * @typedef {K extends `${infer B}_${infer A}` ? A : never} Cdr
 */

/**
 * Transforms an object, `T`, with non-object value properties where each property key can be mapped back to `TOriginal` using {@link ReconstructValue<TOriginal, keyof T>}
 * @template {AbstractModel} TOriginal
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as StartsWith<K, "$"> extends never ? never : K]: number} & ReconstructObject<Partial<TOriginal>, keyof T>} ReconstructAbstractModel
 */

/**
 * Transforms a string or union thereof that resembles some finitely nested properties inside of `TOriginal` model 
 * into its actual representation as shown in `TOriginal`. 
 * @template {AbstractModel} TOriginal
 * @template {string|symbol|number} TSerializedKey
 * @typedef {Contains<TSerializedKey, "_"> extends never 
 *   ? TSerializedKey extends keyof TOriginal ? TOriginal[TSerializedKey] : never
 *   : {[K in Car<TSerializedKey> as K extends keyof TOriginal ? K : never]: K extends keyof TOriginal 
 *     ? TOriginal[K] extends (infer R extends AbstractModel)[]|undefined
 *       ? ReconstructObject<R, Cdr<TSerializedKey>> 
 *       : TOriginal[K] extends AbstractModel|undefined
 *         ? ReconstructObject<Exclude<TOriginal[K], undefined>, Cdr<TSerializedKey>> 
 *         : TOriginal[K]
 *     : never} 
 * } ReconstructObject
 */

/**
 * Model representing grouped models, including aggregates.
 * @template {AbstractModel} TTableModel
 * @typedef {Partial<TTableModel>
 *  & Partial<{ $total: number }>
 *  & Partial<{[K in keyof TTableModel as `$count_${K & string}`]: number}>
 *  & Partial<{[K in keyof TTableModel as `$avg_${K & string}`]: number}>
 *  & Partial<{[K in keyof TTableModel as `$max_${K & string}`]: number}>
 *  & Partial<{[K in keyof TTableModel as `$min_${K & string}`]: number}>
 *  & Partial<{[K in keyof TTableModel as `$sum_${K & string}`]: number}>} GroupedColumnsModel
 */

/**
 * Model parameter that is passed into the callback function for `.groupBy`
 * @template {AbstractModel} TTableModel
 * @typedef {AugmentAllValues<TTableModel>} GroupByCallbackModel
 */

/**
 * Object representing the `aggregate` object passed into the `.groupBy` callback function.
 * @typedef {Object} Aggregates
 * @prop {() => "$total"} total Gets the total count of all records from the query.
 * @prop {AggrCountCallback} count Gets the count of distinct rows for that field.
 * @prop {AggrAvgCallback} avg Gets the average amount across all rows for that field.
 * @prop {AggrMaxCallback} max Gets the maximum amount between all rows for that field.
 * @prop {AggrMinCallback} min Gets the minimum amount between all rows for that field.
 * @prop {AggrSumCallback} sum Gets the total sum amount across all rows for that field.
 */

// Aggregated functions return something different than their actual value because the TypeScript return value
//   is constructed to accurately reflect the real return values
//   whereas the actual return values are used for the actual command.

/**
 * Creates an aggregated column for the count of distinct rows of some column, `col`, passed in.
 * @template {AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$count_${K & string}`}
 * The new property key that will exist in all records queried.
 */
function count(col) {
    return /** @type {any} */ (`COUNT(DISTINCT ${String(col).replace(/`/g, "")}) AS \`$count_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the average of some column, `col`, passed in.
 * @template {AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$avg_${K & string}`}
 * The new property key that will exist in all records queried.
 */
function avg(col){ 
    return /** @type {any} */ (`AVG(${String(col).replace(/`/g, "")}) AS \`$avg_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the maximum of some column, `col`, passed in.
 * @template {AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$max_${K & string}`}
 * The new property key that will exist in all records queried.
 */
function max(col){ 
    return /** @type {any} */ (`MAX(${String(col).replace(/`/g, "")}) AS \`$max_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the minimum of some column, `col`, passed in.
 * @template {AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$min_${K & string}`}
 * The new property key that will exist in all records queried.
 */
function min(col){ 
    return /** @type {any} */ (`MIN(${String(col).replace(/`/g, "")}) AS \`$min_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the sum of some column, `col`, passed in.
 * @template {AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$sum_${K & string}`}
 * The new property key that will exist in all records queried.
 */
function sum(col){ 
    return /** @type {any} */ (`SUM(${String(col).replace(/`/g, "")}) AS \`$sum_${String(col).replace(/`/g, "")}\``);
}

/** @typedef {typeof count} AggrCountCallback */
/** @typedef {typeof avg} AggrAvgCallback */
/** @typedef {typeof max} AggrMaxCallback */
/** @typedef {typeof min} AggrMinCallback */
/** @typedef {typeof sum} AggrSumCallback */

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
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? AllKeysRequired<Required<T[]>> : TTableModel[K] extends AbstractModel|undefined ? AllKeysRequired<Required<Required<TTableModel>[K]>> : TTableModel[K]}} AllKeysRequired
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
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} and Apply an AND chain to your WHERE clause.
 * @prop {(modelCallback: ChainCallback<TTableModel, TOriginalModel>) => Chain<TTableModel, TOriginalModel>} or Apply an OR chain to your WHERE clause.
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
 * @property {number} depth
 * @property {Chains} chain
 * @property {keyof TTableModel} property
 * @property {"="|"<>"|"<"|">"|"<="|">="|"LIKE"|"IN"|"IS"|"IS NOT"} operator
 * @property {string|number|boolean|Date|string[]|number[]|boolean[]|Date[]|null} value
 */

export const Types = {};