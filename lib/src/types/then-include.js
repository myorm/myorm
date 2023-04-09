/**
 * @template {AbstractModel} T
 * @callback IncludeModelCallback
 * @param {{[K in keyof Required<OnlyAbstractModels<T>>]: IncludeModelCallbackAliasChain<OnlyAbstractModels<T>[K]>}} model
 * @returns {void}
 */

/**
 * @template {AbstractModel} T
 * @callback ThenIncludeModelCallback
 * @param {{[K in keyof Required<T>]: IncludeModelCallbackAliasChain<T[K]>}} includingModel
 * @returns {IncludeModelCallbackAliasChain<T>}
 */

/**
 * @template {AbstractModel} T
 * @typedef {Object} IncludeModelCallbackAliasChain
 * @prop {(alias: string) => IncludeModelCallbackThenIncludeChain<T>} as
 */

/**
 * @template {AbstractModel} T
 * @typedef {Object} IncludeModelCallbackThenIncludeChain
 * @prop {(includingModelCallback: ThenIncludeModelCallback<T>) => IncludeModelCallbackAliasChain<T>} thenInclude
 * @returns {void}
 */

export default {};