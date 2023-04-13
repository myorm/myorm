//@ts-check
/** @typedef {{[key: string]: any}} AbstractModel */

import { WhereBuilder } from '../where-builder.js';

/**
 * Recursively nested array of T generic types.
 * @template T
 * @typedef {(T|RecursiveArray<T>)[]} RecursiveArray
 */

/**
 * Augments keys from T where the respective values of each key extend AbstractModel into the same key but prepended with '$'. 
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as T[K] extends AbstractModel|undefined ? never : K]: T[K]} & {[K in keyof T as K extends string ? T[K] extends AbstractModel|undefined ? `$${K}` : never : never]: T[K]}} AugmentKeysWith$
 */

/**
 * Object to chain AND and OR conditions onto a WHERE clause.
 * @template {AbstractModel} TTableModel
 * @typedef {Object} Chain
 * prop {(modelCallback: (m: {[K in keyof import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>]: WhereBuilder<import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>, K>}) => void) => Chain<TTableModel>} and Apply an AND chain to your WHERE clause.
 * prop {(modelCallback: (m: {[K in keyof import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>]: WhereBuilder<import('../toolbelt.js').OnlyNonAbstractModels<TTableModel>, K>}) => void) => Chain<TTableModel>} or Apply an OR chain to your WHERE clause.
 * @prop { (modelCallback: (m: { [K in keyof AugmentKeysWith$<TTableModel>]: AugmentKeysWith$<TTableModel>[K] extends AbstractModel | undefined ? { [K2 in keyof Required<AugmentKeysWith$<TTableModel>[K]>]: WhereBuilder<Required<AugmentKeysWith$<TTableModel>[K]>, K2> } : WhereBuilder<TTableModel, K extends symbol ? never : K> }) => Chain<TTableModel>) => Chain<TTableModel>} and Apply an AND chain to your WHERE clause.
 * @prop { (modelCallback: (m: { [K in keyof AugmentKeysWith$<TTableModel>]: AugmentKeysWith$<TTableModel>[K] extends AbstractModel | undefined ? { [K2 in keyof Required<AugmentKeysWith$<TTableModel>[K]>]: WhereBuilder<Required<AugmentKeysWith$<TTableModel>[K]>, K2> } : WhereBuilder<TTableModel, K extends symbol ? never : K> }) => Chain<TTableModel>) => Chain<TTableModel>} or Apply an OR chain to your WHERE clause.
 */

/**
 * Function definition for every type of condition to be created in a WHERE clause.
 * @template {AbstractModel} TTableModel
 * @template {keyof TTableModel} TColumn
 * @callback Condition
 * @param {TTableModel[TColumn]} value
 * @returns {Chain<TTableModel>}
 */

/** 
 * Function used to help initialize building a WHERE clause.
 * @template {AbstractModel} TTableModel 
 * @typedef {(m: {[K in keyof TTableModel]: WhereBuilder<TTableModel, K>}) => void} WhereBuilderFunction 
 */

/**
 * Condition configuration used to assist in building WHERE clauses.
 * @template {AbstractModel} TTableModel
 * @typedef {Object} ConditionConfig
 * @property {number} depth
 * @property {"WHERE"|"OR"|"AND"} chain
 * @property {keyof TTableModel} property
 * @property {"="|"<>"|"<"|">"|"<="|">="|"LIKE"|"IN"} operator
 * @property {string|number|boolean|Date|string[]|number[]|boolean[]|Date[]} value
 */


export default {};