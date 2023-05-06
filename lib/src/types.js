//@ts-check

/**
 * @typedef {object} SyntaxOptions
 * @prop {string} escapeCharacter
 * Escape character used to escape columns and table names
 * @prop {string=} whereEqual
 * Operator used for equality
 * @prop {string=} whereNotEqual
 * Operator used for inequality
 * @prop {string=} whereLessThan
 * Operator used for less than
 * @prop {string=} whereGreaterThan
 * Operator used for greater than
 * @prop {string=} whereLessThanOrEqualTo
 * Operator used for less than or equal to
 * @prop {string=} whereGreaterThanOrEqualTo
 * Operator used for greater than or equal to
 * @prop {string=} whereLike
 * Operator used for string comparison
 * @prop {string=} whereLikeAnyChar
 * Character used in LIKE to check for any characters
 * @prop {string=} whereNot
 * Operator used for negation
 * @prop {string=} whereIsNull
 * Operator used for is null comparison
 * @prop {string=} whereIsNotNull
 * Operator used for is (not) null comparison
 */

/**
 * @typedef {object} CommandContext
 * @prop {string} mainTableName
 * @prop {boolean} hasOneToOne
 * @prop {boolean} hasOneToMany
 * @prop {boolean} isCount
 */

/** @typedef {{ cmd: string, args: any[] }} CommandData */

/** 
 * @typedef {object} QueryData 
 * @prop {string[]} selects
 * @prop {string[]} from
 * @prop {string|undefined} where
 * @prop {string[]|undefined} groupBy
 * @prop {SortByKeyConfig[]} orderBy
 * @prop {string|number|undefined} limit
 * @prop {string|number|undefined} offset
 * @prop {any[]} whereArgs
 */
/** @typedef {object} InsertData */
/** @typedef {object} UpdateData */
/** @typedef {object} DeleteData */
/** @typedef {object} DescribeData */

/**
 * @typedef {object} SerializationConfig
 * @prop {(data: QueryData) => CommandData} forQuery 
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for querying the corresponding database.
 * @prop {(data: InsertData) => CommandData} forInsert 
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for inserting into the corresponding database.
 * @prop {(data: UpdateData) => CommandData} forUpdate
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for updating the corresponding database.
 * @prop {(data: DeleteData) => CommandData} forDelete
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for deleting from the corresponding database.
 * @prop {((data: DescribeData) => CommandData)=} forDescribe
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for describing a table in the corresponding database.
 * @prop {((data: InsertData) => CommandData)=} forUpsert
 * Defines behavior for serializing constructed data from MyORM into a syntactically correct string for upserting into the corresponding database.
 */

/** 
 * @template {AbstractModel} TTableModel
 * @typedef {object} MyORMAdapter 
 * @prop {any} connection
 * The connection used within the context
 * @prop {SyntaxOptions} syntax
 * Defines some syntax that is used throughout the language being used for the corresponding database.
 * @prop {(cmd: string, args: any[]) => Promise<TTableModel[]>} handleQuery 
 * Defines the behavior of how a query transaction is executed and passes the correct data back to MyORM.
 * @prop {(cmd: string, args: any[]) => Promise<number>} handleCount
 * Defines the behavior of how a query transaction for count is executed and passes the correct data back to MyORM.
 * @prop {(cmd: string, args: any[]) => Promise<number[]>} handleInsert 
 * Defines the behavior of how an insert transaction is executed and passes the correct data back to MyORM.
 * @prop {(cmd: string, args: any[]) => Promise<number>} handleUpdate 
 * Defines the behavior of how an update transaction is executed and passes the correct data back to MyORM.
 * @prop {(cmd: string, args: any[]) => Promise<number>} handleDelete 
 * Defines the behavior of how a delete transaction is executed and passes the correct data back to MyORM.
 * @prop {((cmd: string, args: any[]) => Promise<any>)=} handleDescribe 
 * Defines the behavior of how a describe transaction is executed and passes the correct data back to MyORM.
 * @prop {((cmd: string, args: any[]) => Promise<TTableModel[]>)=} handleUpsert 
 * Defines the behavior of how a replace transaction is executed and passes the correct data back to MyORM.
 * @prop {(error: { new(msg: string): import('./exceptions.js').MyORMSyntaxError }, commandContext: CommandContext) => SerializationConfig} onSerialization 
 * Defines how certain transactions will be serialized into their correct format to be passed to the corresponding database.
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
 * @property {string} host Host of the MySQL server
 * @property {string} schema Schema of database and table in format of [database].[dbo].[table]
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
 * @property {import('mysql2').QueryError} error Error thrown by mysql2
 * @property {string} dateIso Date in ISO string format
 * @property {string} host Host of the MySQL server
 * @property {string} schema Schema of database and table in format of [database].[dbo].[table]
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

// group by aggregate functions (@TODO needs documentation)

/**
 * Object representing the `aggregate` object passed into the `.groupBy` callback function.
 * @template {AbstractModel} TModel
 * @typedef {Object} Aggregates
 * @prop {() => string} count Gets the count of all records from the query.
 * @prop {(column: string) => string} avg Gets the average amount across all rows for that field.
 * @prop {(column: string) => string} sum Gets the total sum amount across all rows for that field.
 * @prop {(column: string) => string} max Gets the maximum amount between all rows for that field.
 * @prop {(column: string) => string} min Gets the minimum amount between all rows for that field.
 */

/**
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
 * @template {AbstractModel} TTableModel
 * @callback SortByCallback
 * @param {SortByCallbackConfig<TTableModel>} model
 * @returns {SortByKeyConfig|SortByKeyConfig[]}
 */

/**
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof Required<TTableModel>]: TTableModel[K] extends (infer T extends AbstractModel)[]|undefined ? SortByCallbackConfig<Required<T>> : TTableModel[K] extends AbstractModel|undefined ? SortByCallbackConfig<Required<TTableModel[K]>> : SortByKeyConfig & DirectionCallbacks}} SortByCallbackConfig
 */

/**
 * @typedef {object} SortByKeyConfig
 * @prop {string} column
 * @prop {"ASC"|"DESC"} direction
 */

/**
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
 * @returns {Chain<TTableModel>}
 */

/** 
 * Function used to help initialize building a WHERE clause.
 * @template {AbstractModel} TTableModel 
 * @typedef {(m: {[K in keyof TTableModel]: import('./where-builder.js').WhereBuilder<TTableModel, K>}) => void} WhereBuilderFunction 
 */

/**
 * Condition configuration used to assist in building WHERE clauses.
 * @template {AbstractModel} TTableModel
 * @typedef {Object} ConditionConfig
 * @property {number} depth
 * @property {"WHERE"|"OR"|"AND"} chain
 * @property {keyof TTableModel} property
 * @property {"="|"<>"|"<"|">"|"<="|">="|"LIKE"|"IN"|"IS"|"IS NOT"} operator
 * @property {string|number|boolean|Date|string[]|number[]|boolean[]|Date[]|null} value
 */

/**
 * Model parameter that is passed into the callback function for `.groupBy`
 * @template {AbstractModel} TTableModel
 * @typedef {{[K in keyof TTableModel]: TTableModel[K] extends AbstractModel|undefined ? GroupByCallbackModel<TTableModel[K]> : string}} GroupByCallbackModel
 */

export const Types = {};