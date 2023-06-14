// @ts-check
import EventEmitter from "events";
import * as Types from './types.js';

export class CommandListener extends EventEmitter {
    
    /**
     * Creates a new EventEmitter tailored for logging MyORM commands.
     * @param {string} tableName 
     */
    constructor(tableName) {
        super();
        this.tableName = tableName.toLowerCase();
        this.setMaxListeners(Infinity);
    }

    /**
     * Adds the listener function to the end of the listeners array for the event named `eventName`. No checks are made to see if the listener has already been added. 
     * Multiple calls passing the same combination of `eventName` and listener will result in the listener being added, and called, multiple times.
     * @param {string|symbol} event The name of the event.
     * @param {(...args: any[]) => void} callback The callback function
     * @returns {this} Reference to the EventEmitter, so that calls can be chained.
     */
    on(event, callback) {
        super.on(event, callback);
        return this;
    }

    /**
     * Synchronously calls each of the listeners registered for the event named `eventName`, in the order they were registered, passing the supplied arguments to each.
     *
     * Returns `true` if the event had listeners, `false` otherwise.
     * @param {string|symbol} event 
     * @param  {...any} args 
     * @returns {boolean}
     */
    emit(event, ...args) {
        let emitted = super.emit(event, ...args);
        return emitted;
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.SuccessHandler} callback Function that executes when a query command is executed on this context.
     */
    onQuerySuccess(callback) {
        this.on(`query-success-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.FailHandler} callback Function that executes when a query command is executed on this context.
     */
    onQueryFail(callback) {
        this.on(`query-fail-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.SuccessHandler} callback Function that executes when a query command is executed on this context.
     */
    onInsertSuccess(callback) {
        this.on(`insert-success-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.FailHandler} callback Function that executes when a query command is executed on this context.
     */
    onInsertFail(callback) {
        this.on(`insert-fail-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.SuccessHandler} callback Function that executes when a query command is executed on this context.
     */
    onUpdateSuccess(callback) {
        this.on(`update-success-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.FailHandler} callback Function that executes when a query command is executed on this context.
     */
    onUpdateFail(callback) {
        this.on(`update-fail-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.SuccessHandler} callback Function that executes when a query command is executed on this context.
     */
    onDeleteSuccess(callback) {
        this.on(`delete-success-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {Types.FailHandler} callback Function that executes when a query command is executed on this context.
     */
    onDeleteFail(callback) {
        this.on(`delete-fail-${this.tableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context
     * whenever a Warning has been internally emitted.
     * @param {Types.WarningHandler} callback 
     */
    onWarning(callback) {
        this.on(`warning-${this.tableName}`, callback);
    }

    /**
     * @param {Types.OnSuccessData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitQuerySuccess(detail) {
        return this.emit(`query-success-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnFailData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitQueryFail(detail) {
        return this.emit(`query-fail-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnSuccessData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitInsertSuccess(detail) {
        return this.emit(`insert-success-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnFailData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitInsertFail(detail) {
        return this.emit(`insert-fail-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnSuccessData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitUpdateSuccess(detail) {
        return this.emit(`update-success-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnFailData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitUpdateFail(detail) {
        return this.emit(`update-fail-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnSuccessData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitDeleteSuccess(detail) {
        return this.emit(`delete-success-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnFailData} detail Details of the command when it was sent.
     * @returns {boolean} True if the event was emitted, false otherwise
     */
    emitDeleteFail(detail) {
        return this.emit(`delete-fail-${this.tableName}`, detail);
    }

    /**
     * @param {Types.OnWarningData} detail Details of the warning.
     * @returns {boolean} True if the event was emitted, false otherwise.
     */
    emitWarning(detail) {
        return this.emit(`warning-${this.tableName}`, detail);
    }
}