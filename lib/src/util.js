//@ts-check
import * as Types from './types.js';

// These types are in here because if they are in `types.js`, then the TypeScript compiler will crash on an infinite loop.

/** @typedef {typeof count} AggrCountCallback */
/** @typedef {typeof avg} AggrAvgCallback */
/** @typedef {typeof sum} AggrSumCallback */
/** @typedef {typeof min} AggrMinCallback */
/** @typedef {typeof max} AggrMaxCallback */

/**
 * Creates an aggregated column for the count of distinct rows of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$count_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function count(col) {
    return /** @type {any} */ (`COUNT(DISTINCT ${String(col).replace(/`/g, "")}) AS \`$count_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the average of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$avg_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function avg(col) {
    return /** @type {any} */ (`AVG(${String(col).replace(/`/g, "")}) AS \`$avg_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the maximum of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$max_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function max(col) {
    return /** @type {any} */ (`MAX(${String(col).replace(/`/g, "")}) AS \`$max_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the minimum of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$min_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function min(col) {
    return /** @type {any} */ (`MIN(${String(col).replace(/`/g, "")}) AS \`$min_${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the sum of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$sum_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function sum(col) {
    return /** @type {any} */ (`SUM(${String(col).replace(/`/g, "")}) AS \`$sum_${String(col).replace(/`/g, "")}\``);
}