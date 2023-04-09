//@ts-check

import { MyORMContext } from './contexts.js';

/** @typedef {import('mysql2').QueryError} MySql2QueryError */

/** @typedef {{[key: string]: any}} AbstractModel */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel`s.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof T as T[K] extends AbstractModel|undefined ? K : never]: T[K]}} OnlyAbstractModels
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof T as T[K] extends AbstractModel[]|undefined ? K : never]: 
 *      T[K] extends (infer R extends AbstractModel)[]|undefined ? R : never}} OnlyAbstractModelArrays
 */

/** 
 * Filters out an object model type to only have keys that are valued with `AbstractModel` or `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)]: (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)[K]}} OnlyAbstractModelTypes
 */

/**
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as T[K] extends AbstractModel|undefined ? never : K]: T[K]}} OnlyNonAbstractModels
 */

/**
 * Callback definition for the `from` function to help configure the Table name for an informal foreign relationship between two tables using `.include()`.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipFrom
 * @param {string} realTableName The real table name for the foreign table being configured.
 * @returns {{with: RelationshipWith<TFrom, TTo>}} Chaining function `with` to further configure the relationship.
 */

/**
 * Callback definition for the `with` function to help configure the foreign key for the `TFrom` table.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipWith
 * @param {keyof TFrom} thisColumnName Some column from `TFrom` that represents the informal foreign relationship to `TTo`.
 * @returns {{to: RelationshipTo<TTo>}} Chaining function `to` to further configure the relationship.
 */

/**
 * Callback definition for the `to` function to help configure the foreign key for the `TTo` table.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipTo
 * @param {TTo extends undefined ? never : keyof TTo} thatColumnName Some column from `TTo` that represents the informal foreign key pair to the previous `.with` function.
 */

/**
 * @typedef {Object} IncludeOnOperatorCallback
 * @property {() => void} beingEqual
 * @property {() => void} beingNotEqual
 * @property {() => void} beingLessThan
 * @property {() => void} beingGreaterThan
 * @property {() => void} beingLessThanOrEqualTo
 * @property {() => void} beingGreaterThanOrEqualTo
 * @property {() => void} beingLike
 */

/**
 * @template {AbstractModel} TThisModel
 * @template {AbstractModel} TThatModel
 * @callback IncludeOnCallback
 * @param {keyof TThisModel extends string ? keyof TThisModel : never} thisKey
 * @param {TThatModel extends Array<infer T> ? T[0] extends string ? keyof T[0] : never : keyof TThatModel extends string ? keyof TThatModel : never} thatKey
 * param {TThatModel extends [] ? (keyof TThatModel[0] extends string ? keyof TThatModel[0] : never) : (keyof TThatModel extends string ? keyof TThatModel : never)} thatKey
 * @returns {IncludeOnOperatorCallback}
 */

/**
 * @template {AbstractModel} TThisModel
 * @typedef {Required<{[K in keyof TThisModel as TThisModel[K] extends (AbstractModel[]|AbstractModel|undefined) ? K : never]: { include: AbstractModelKeysToOnCallbacks<TThisModel[K]>}}>} AbstractModelKeysToOnCallbacks
 */

/**
 * @template {AbstractModel} TThisModel
 * @callback IncludeCallback
 * @param {OnlyAbstractModelTypes<TThisModel>} model
 */

/**
 * Replaces an old key of TModel with a new key.
 * @template TModel Model to replace the key.
 * @template {keyof TModel} TOldKey Old key name to remove.
 * @template {string} TNewKey New key name to take place of the old key.
 * @typedef {TNewKey extends keyof TModel ? never : {[K in keyof Record<keyof Omit<TModel, TOldKey>|TNewKey, unknown>]: K extends keyof TModel ? TModel[K] : TModel[TOldKey]}} ReplaceKey
 */

/** 
 * Augment a single key to be optional in TModel. Everything else remains their original type.
 * @template TModel Model to restrict a key to be optional.
 * @template {keyof TModel} TModelKey Key in TModel to make optional.
 * @typedef {Omit<TModel, TModelKey> & Partial<Pick<TModel, TModelKey>>} OptionalKey 
 */

/** 
 * Augments all keys in TModel to be optional, except TModelKey. TModelKey will become a required Key.
 * @template TModel Model to augment.
 * @template {keyof TModel} TModelKey Key in TModel to make required.
 * @typedef {RequiredKey<Partial<TModel>, TModelKey>} AllOptionalExcept 
 */

/** 
 * Augment a single key to be required in TModel. Everything else remains their original type.
 * @template TModel Model to restrict a key to be required.
 * @template {keyof TModel} TModelKey Key in TModel to make required.
 * @typedef {Omit<TModel, TModelKey> & Required<Pick<TModel, TModelKey>>} RequiredKey 
 */

/**
 * Augments all keys in TModel to be required, except TModelKey. TModelKey will become an optional Key.
 * @template TModel Model to augment.
 * @template {keyof TModel} TModelKey Key in TModel to make optional.
 * @typedef {OptionalKey<Required<TModel>, TModelKey>} AllRequiredExcept 
 */

/** 
 * Get all the Keys of TModel where the value specified by the key is of type ValueType.
 * @template TModel Model to check keys from.
 * @template ValueType Type of the value that the keys should be filtered on.
 * @typedef {keyof {[Key in keyof TModel as TModel[Key] extends ValueType ? Key : never]: TModel[Key]}} KeyByValueType 
 */

/**
 * Used to specify the metadata required to create a MySqlJoinContext class object.
 * @template {AbstractModel} TModel Model object that the key should represent.
 * @typedef {Object} TableJoinMetadata
 * @property {keyof TModel} key Key of the TModel object to join on.
 * @property {string=} name Name of the table to reference the key from.
 */

/**
 * Represents the model object of two tables joined where both table models maintain their original types.
 * @template {AbstractModel} TLeftModel table model represented by the left table being joined.
 * @template {AbstractModel} TRightModel table model represented by the right table being joined.
 * @typedef {TLeftModel & TRightModel} InnerJoinModel
 */

/**
 * Represents the model object of two tables joined where the left table model maintains its original types.
 * @template {AbstractModel} TLeftModel table model represented by the left table being joined.
 * @template {AbstractModel} TRightModel table model represented by the right table being joined.
 * @typedef {TLeftModel & Partial<TRightModel>} LeftJoinModel
 */

/**
 * Represents the model object of two tables joined where the right table model maintains its original types.
 * @template {AbstractModel} TLeftModel table model represented by the left table being joined.
 * @template {AbstractModel} TRightModel table model represented by the right table being joined.
 * @typedef {Partial<TLeftModel> & TRightModel} RightJoinModel
*/

/**
 * Represents the model object of two tables joined where the both table models maintain their original types.
 * @template {AbstractModel} TLeftModel table model represented by the left table being joined.
 * @template {AbstractModel} TRightModel table model represented by the right table being joined.
 * @typedef {Partial<TLeftModel> & Partial<TRightModel>} FullJoinModel
 */

/**
 * Extracts the generic parameter, TTableModel, from the given TTable MySqlTableContext class object. 
 * @template {MyORMContext<?>} TTable MySqlTableContext to extract the model from.
 * @typedef {TTable extends MyORMContext<infer TTableModel> ? TTableModel : never} ExtractModel
 */

/**
 * Function template that accepts a WhereBuilder class object argument parameter and returns a WhereBuilder class object.
 * @template {AbstractModel} TTableModel Model that represents the Table where the WHERE clause is being built.
 * @callback WhereBuilderFunction
 * @param {WhereBuilder<TTableModel>} where WhereBuilder class object that can be used to assist in building a WHERE clause.
 * @returns {WhereBuilder<TTableModel>} The WhereBuilder class object that was built.
 */

/**
 * Function template that accepts a OrderBuilder class object argument parameter and returns a WhereBuilder class object.
 * @template {AbstractModel} TTableModel Model that represents the Table where the WHERE clause is being built.
 * @callback OrderByBuilderFunction
 * @param {OrderBuilder<TTableModel>} order OrderBuilder class object that can be used to assist in building an ORDER BY clause.
 * @returns {OrderBuilder<TTableModel>|OrderByFunction<TTableModel>} The OrderBuilder class object that was built.
 */

/**
 * Function template that accepts a GroupBuilder class object argument parameter and returns a WhereBuilder class object.
 * @template {AbstractModel} TTableModel Model that represents the Table where the WHERE clause is being built.
 * @callback GroupByBuilderFunction
 * @param {GroupBuilder<TTableModel>} group GroupBuilder class object that can be used to assist in building an ORDER BY clause.
 * @returns {GroupBuilder<TTableModel>} The GroupBuilder class object that was built.
 */

/**
 * All of the options available to pass into the "options" argument in the constructor for MySqlTableContext.
 * @typedef {Object} TableContextOptions
 * @property {boolean=} allowUpdateOnAll Permit updating to all records in the Table.
 * @property {boolean=} allowTruncation Permit truncation of the Table.
 * @property {boolean=} sortKeys Sort keys before being inserted. This can possibly prevent any mangling of key/value pairs.
 */

/**
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
 * @typedef OnFailData
 * @property {MySql2QueryError} error Error thrown by mysql2
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

/** 
 * Aliases for special fields that are returned when a GROUP BY clause is included in a query.
 * @typedef {Object} GroupByAliases
 * @property {number=} $count Count of records in the group. Only accessible if the group => group.by() function was used. If no clause was provided, then this will be undefined.
 * @property {string=} $yearDay The date of the group specified in 'YYYY/dd'. Only accessible if the group => group.byDay() function was used. If no clause was provided, then this will be undefined.
 * @property {string=} $yearWeek The date of the group specified in 'YYYY/mm/dd'. Only accessible if the group => group.byWeek() function was used. If no clause was provided, then this will be undefined.
 * @property {string=} $yearMonth The date of the group specified in 'YYYY/mm'. Only accessible if the group => group.byMonth() function was used. If no clause was provided, then this will be undefined.
 * @property {string=} $year The date of the group specified in 'YYYY'. Only accessible if the group => group.byYear() function was used. If no clause was provided, then this will be undefined.
 */

/**
 * Used to provide context to multiple ORDER BY keys and the sort order it is in.
 * @template {AbstractModel} TTableModel Table model object that is used to help ascension/descension.
 * @typedef {Object} OrderByFunction
 * @property {ByCallback<TTableModel>} by Specifies a key to sort by. (If .asc() nor .desc() is followed, the default is ascending order)
 * @property {AscendingCallback<TTableModel>} asc Specifies the sort order to be ascending.
 * @property {DescendingCallback<TTableModel>} desc Specifies the sort order to be descending.
 * @property {() => string} toString Specifies the sort order to be descending.
 */

/**
 * Specifies a key to sort by. (If .asc() nor .desc() is followed, the default is ascending order)
 * @template {AbstractModel} TTableModel 
 * @callback ByCallback
 * @param {keyof TTableModel} tKey
 * @returns {OrderBuilder<TTableModel>} The reference to the original builder building the ORDER BY clause.
 */

/**
 * Specifies the sort order to be ascending.
 * @template {AbstractModel} TTableModel 
 * @callback AscendingCallback
 * @returns {OrderBuilder<TTableModel>} The reference to the original builder building the ORDER BY clause.
 */

/**
 * Specifies the sort order to be descending.
 * @template {AbstractModel} TTableModel 
 * @callback DescendingCallback
 * @returns {OrderBuilder<TTableModel>} The reference to the original builder building the ORDER BY clause.
 */

/**
 * Augments two strings so it appears as "__str1_str2__".
 * @template {string} TString1 String to append.
 * @template {string} TString2 String to append.
 * @typedef {`__${TString1}_${TString2}__`} AugmentString
 */

/**
 * Creates a new AliasMap where the Key can be any string but the value to that key must be a key of TModel
 * @template TModel @typedef {{[Key in keyof TModel as TModel[Key] extends string ? TModel[Key] : never]: keyof TModel}} AliasMap
 */

/**
 * Gets all Value Types of TModel
 * @template TModel @typedef {TModel[keyof TModel]} ValueTypesOf
 */

/**
 * Gets the Value Type of TModel given a keyof TModel, TModelKey
 * @template TModel 
 * @template {keyof TModel} [TModelKey=keyof TModel]
 * @typedef {TModel[TModelKey]} ValueTypeOf
 */

/**
 * Used in "Narrow" to recursively dig into arrays/objects and narrow them down to their literal type.
 * @template T Type to narrow down
 * @typedef {(T extends [] ? [] : never)|(Try<T, (string|number|bigint|boolean)>)|({[K in keyof T]: Try<T[K], Function, NarrowRaw<T[K]>>})} NarrowRaw
 */

/**
 * Explicitly checks to see if TTypeToCheck is of type TTypeToForce. If it is, then it returns TTypeToCheck, otherwise it returns Catch.
 * @template TTypeToCheck Type to check for
 * @template TTypeToForce Type to check against
 * @template {any} [Catch=never] Type to return if the type check fails
 * @typedef {TTypeToCheck extends TTypeToForce ? TTypeToCheck : Catch} Try
 */

/**
 * Prevents widening on an generic parameter.
 * @template T Type to narrow
 * @typedef {Try<T, [], NarrowRaw<T>>} Narrow
 */

/**
 * Create a Type that represents an Alias of TModel with different keys but with the same value types of TModel, depending on the aliased keys from TAliasMap.
 * @template TModel
 * @template {Narrow<AliasMap<TModel>>} TAliasMap
 * @typedef {{[TModelKey in keyof TAliasMap]: ValueTypeOf<TModel, Try<TAliasMap[TModelKey], keyof TModel>>}} Alias
 */

export default {};