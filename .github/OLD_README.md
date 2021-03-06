![myorm-logo-text-description-640x283](https://github.com/myorm/myorm/assets/55516053/011d0513-48b5-44bc-aa1b-06860eeb7517)

# MyORM

__DISCLAIMER: Much of this README is outdated, and will be updated as the library gets more tested. The final documentation will be located at https://myorm.dev/__

MyORM is a library dedicated for interacting with a MySQL database by building transactions using an Object Relationship Model (hence the name `myorm`)

# Table of Contents

  - [Overview](#overview)
    - [Examples overview](#readme-overview-of-examples)
    - [Chinook Database](#digital_media_store-database)
    - [Tutorial: Setup Chinook Database](#tutorial-setup-chinook-database)
  - [Initializing](#initializing)
    - [Adapters](#adapters)
      - [MySQL](#mysql)
      - [MSSQL](#mssql-microsoft-sql)
      - [SQLite](#sqlite)
      - [POSTgres](#postgres)
    - [Examples](#constructor-examples)
  - [Transaction Functions](#transaction-functions)
    - [Explicit Transaction Functions](#explicit-transaction-functions)
    - [Implicit Transaction Functions](#implicit-transaction-functions)
  - [Clause Functions](#clause-functions)
    - [WHERE](#where)
      - [WhereBuilder](#wherebuilder)
      - [Negation](#where-negation)
      - [Chaining and Nesting](#where-chaining)
      - [Tips and Tricks](#where-tips-and-tricks)
      - [Examples](#where-examples)
    - [ORDER BY](#sortby)
      - [Examples](#sortby-examples)
    - [GROUP BY](#groupby)
      - [Examples](#groupby-examples)
    - [LIMIT and OFFSET](#take-and-skip)
      - [LIMIT Examples](#take-examples)
      - [OFFSET Examples](#skip-examples)
  - [Aliasing](#aliasing)
    - [Examples](#alias-examples)
  - [Querying](#querying)
    - [SELECT](#select)
      - [Examples](#select-examples)
    - [COUNT](#count)
      - [Examples](#count-examples)
  - [Inserting](#inserting)
    - [Examples](#insert-examples)
  - [Updating](#updating)
    - [(Implicit) Examples](#update-examples)
    - [(Explicit) Examples](#updateselect-examples)
  - [Deleting](#deleting)
    - [(Implicit) Examples](#delete-examples)
    - [(Explicit) Examples](#deleteselect-examples)
  - [Including](#including)
    - [Configuring Relationships](#configuring-relationships)
    - [LEFT JOIN](#including-the-tables-left-join)
  - [Managing State (Programmatic Views)](#managing-state)
  - [Logging](#logging)

# Overview

This library was built in JSDOC TypeScript, however, for readability sake, TypeScript is used in all examples, accompanied by any (applicable) SQL statements that are generated from the respective code.  

This library consists of many functions, some referred to as [Transaction Functions](#transaction-functions), and others as [Clause Functions](#clause-functions).

## README overview of examples

All examples are from the `digital_media_store` database, which is actually the `chinook` database, but renamed. More details on the `chinook` database can be found [here](https://docs.yugabyte.com/preview/sample-data/digital_media_store/#:~:text=About%20the%20Chinook%20database,from%20an%20Apple%20iTunes%20library.).

If you'd like to set up the chinook database schema for your own testing or exploration, please follow the instructions on how to [Setup Chinook Database](#tutorial-setup-chinook-database) on your local machine.

## Chinook Database

The Chinook database comprises of eleven (11) tables that represent Entertainment media in a store. Although, some, or most, of these records that are in the default snapshot of this database may be out of date, you can still use them to learn SQL in its entirety.  

## Tutorial: Setup Chinook Database

Requirements:  
  - Docker  
  - (optional) MySQL Workbench (for executing your own commands)

To set up the `digital_media_store` (chinook) database on your localhost, you can follow this step-by-step tutorial.

  1. Go to https://github.com/traviszuleger/myorm/tree/main/.github/chinook-setup and download the files, `Dockerfile`, `initdb.sql`, and `start-chinook.sh`. (or copy and paste them)  
  2. Place all of the documents listed above in some directory.  
  3. Open up a command shell (or command prompt) and navigate to the directory you placed your documents from step 2.  
  4. Run the commands from `start-chinook.sh`.  
  5. You can now connect to your MySQL database!  
    - Default username: `root`  
    - Default password: `root` (you can change this in the `Dockerfile` file before running the commands from `start-chinook.sh`)  
  6. Connect to the database using the following `mysql2` configuration: `{ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'}`

# Initializing

Initializing `MyORM` is half the battle, as what you set up here is what dictates everything that will happen.  

To start working with `MyORM`, you need to create a `MyORMContext` class object using one of the two constructors.  

The syntax for each constructor is as follows:

  - `new MyORMContext<TTableModel extends {[k: string]: any}>(configOrPool: Pool|PoolOptions, realTableName: string)`: Creates a new MyORMContext connected to the database specified under `Pool` or `PoolOptions` and the table specified by `realTableName`, where `TTableModel` is an exact representation of the table as it is defined in your database.
    - `adapter: MyORMAdapter`: Some `MyORMAdapter` to connect with.
    - `realTableName: string`: The exact string that represents the table name as it appears in your database.
  - `new MyORMContext<TTableModel extends {[k: string]: any}>(configOrPool: Pool|PoolOptions, realTableName: string, options: MyORMContextOptions)`: Creates a new MyORMContext connected to the database specified under `Pool` or `PoolOptions` and the table specified by `realTableName`, where `TTableModel` is an exact representation of the table as it is defined in your database, including some extra options that define some behavior in the context.
    - `<TTableModel>`: Interface representing the table you want this context to work with. Your interface should perfectly represent the table's columns.
    - `adapter: MyORMAdapter`: Some `MyORMAdapter` to connect with.
    - `realTableName: string`: The exact string that represents the table name as it appears in your database.
    - `options: MyORMContextOptions`: Additional options to further configure your context.
      - `allowUpdateOnAll: boolean`: If true, will allow usage of the `.updateSelect()` function __without__ specifying a WHERE clause to update your entire table. (default: false)
      - `allowTruncation: boolean`: If true, will allow usage of the `.truncate()` function to truncate your table. (default: false)

For TypeScript to give you all of the correct information while building your commands, you must provide a generic type parameter for `TTableModel`. This type parameter should perfectly represent your table.  

There are some exceptions to this rule:
  - Property represents a primary key that is a key where it automatically increments in the database, where you should specify it as an optional parameter with `?` appended to the name.
  - Property represents a foreign relationship to another table, where you should it as an optional parameter with `?` appended to the name.

You do not have to use typescript, but it would make things more difficult. Just remember these two rules when not working with typescript:
  - [Clause functions](#clause-functions) will only work off the actual column names in the table being worked on.
  - [Transaction functions](#transaction-functions) can work on either the original column names, or the explicit aliased names given using `.alias()`.

## Adapters

`MyORM` was originally created with intention of only being used for `MySQL` databases, but has since been updated to support adapters for any database.  

In order to use `MyORM`, you will need to use an adapter. Here is a list of some supported adapters for `MyORM`.

### MySQL

Connect `MyORM` to your MySQL database.  

[MySQL Adapter](https://www.npmjs.com/package/@myorm/mysql-adapter)  

### MSSQL (Microsoft SQL)

__work in progress__

Connect `MyORM` to your MSSQL database.  

[MSSQL Adapter](https://www.npmjs.com/package/@myorm/mssql-adapter) 

### SQLite

__work in progress__

Connect `MyORM` to a SQLite file database.  

[SQLite Adapter](https://www.npmjs.com/package/@myorm/sqlite-adapter)  

### POSTgres

__work in progress__

Connect `MyORM` to a POSTgres database.  

[POSTgres Adapter](https://www.npmjs.com/package/@myorm/postgres-adapter)  

## Constructor examples

Example for constructing a new `MyORMContext` with `PoolOptions` for the table, `digital_media_store.Customer`:  

Given the SQL schema,

```sql
CREATE TABLE Customer
(
    CustomerId INT NOT NULL,
    FirstName VARCHAR(40) NOT NULL,
    LastName VARCHAR(20) NOT NULL,
    Company VARCHAR(80),
    Address VARCHAR(70),
    City VARCHAR(40),
    State VARCHAR(40),
    Country VARCHAR(40),
    PostalCode VARCHAR(10),
    Phone VARCHAR(24),
    Fax VARCHAR(24),
    Email VARCHAR(60) NOT NULL,
    SupportRepId INT,
    CONSTRAINT PK_Customer PRIMARY KEY (CustomerId)
);
```

Build the TypeScript interface as,

```ts
export interface Customer {
    CustomerId: number;
    FirstName: string;
    LastName: string;
    Company?: string;
    Address?: string;
    City?: string;
    State?: string;
    Country?: string;
    PostalCode?: string;
    Phone?: string;
    Fax?: string;
    Email: string;
    SupportRepId?: number;
};
```

Using the [MySQL adapter](https://www.npmjs.com/package/@myorm/mysql-adapter), create your context,

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';
const customerCtx = new MyORMContext<Customer>(adapter({ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'}), "Customer");
```

Given the same `Customer` SQL schema and TypeScript interface as above,

Example for constructing a new `MyORMContext` with `Pool` for the table, `digital_media_store.Customer`:

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';
const pool = createMySql2Pool({ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'});
const customerCtx = new MyORMContext<Customer>(adapter(pool), "Customer");
```

Example for constructing a new `MyORMContext` with `Pool` for the table, `digital_media_store.Customer` and `Customer`'s primary key has the 'AUTO_INCREMENT' attribute:  

Given the SQL schema,

```sql
CREATE TABLE Customer
(
    CustomerId INT NOT NULL AUTO_INCREMENT,
    FirstName VARCHAR(40) NOT NULL,
    LastName VARCHAR(20) NOT NULL,
    Company VARCHAR(80),
    Address VARCHAR(70),
    City VARCHAR(40),
    State VARCHAR(40),
    Country VARCHAR(40),
    PostalCode VARCHAR(10),
    Phone VARCHAR(24),
    Fax VARCHAR(24),
    Email VARCHAR(60) NOT NULL,
    SupportRepId INT,
    CONSTRAINT PK_Customer PRIMARY KEY (CustomerId)
);
```

Build the TypeScript interface as,

```ts
export interface Customer {
    CustomerId?: number; // notice the `CustomerId` property being optional here
    FirstName: string;
    LastName: string;
    Company?: string;
    Address?: string;
    City?: string;
    State?: string;
    Country?: string;
    PostalCode?: string;
    Phone?: string;
    Fax?: string;
    Email: string;
    SupportRepId?: number;
};
```

Create your context,

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';
const pool = createMySql2Pool({ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'});
const customerCtx = new MyORMContext<Customer>(adapter(pool), "Customer");
```

__NOTE: You do not have to make your identity property optional, but if you intend to insert into the database, the `.insert` functions will flag your code as type invalid, as it would require that column. If you try to pass a value into a column when inserting and it is attributed as `AUTO_INCREMENT`, typescript will flag the code.__

Example for constructing a new `MyORMContext` with `Pool` for the table, `digital_media_store.Track` with the foreign tables, `digital_media_store.Album`, `digital_media_store.Artist`, `digital_media_store.Genre`, and `digital_media_store.MediaType`.:  

Given the SQL schema,

```sql
CREATE TABLE Track
(
    TrackId INT NOT NULL,
    Name VARCHAR(200) NOT NULL,
    AlbumId INT,
    MediaTypeId INT NOT NULL,
    GenreId INT,
    Composer VARCHAR(220),
    Milliseconds INT NOT NULL,
    Bytes INT,
    UnitPrice NUMERIC(10,2) NOT NULL,
    CONSTRAINT PK_Track PRIMARY KEY  (TrackId)
);
```

Build the TypeScript interface as,

```ts
export interface Track {
    TrackId: number;
    Name: string;
    AlbumId: number;
    MediaTypeId: number;
    GenreId: number;
    Composer: string;
    Milliseconds: number;
    Bytes: number;
    UnitPrice: number;

    // foreign
    Album?: Album;
    Artist?: Artist;
    Genre?: Genre;
    MediaType?: MediaType;
}
```

Create your context,

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';
const pool = createMySql2Pool({ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'});
const customerCtx = new MyORMContext<Track>(adapter(pool), "Track");
```

__NOTE: If your foreign table is a one-to-many relationship, then you can specify that same property, but as an array, like `MyForeignTable?: MyForeignType[];`__


# Transaction Functions

Transaction Functions, in this context, are defined as functions that directly interact with the database with some built command.  

Transaction functions are split amongst two different subsets, explicit and implicit.  

## Explicit Transaction Functions

Explicit transaction functions will consist of a function that uses clauses that were previously built. In `MyORM`, these functions will be:  
  - `.select()`
  - `.count()`
  - `.updateSelect()` __this may get renamed__
  - `.deleteSelect()` __this may get renamed__

Each of these functions will work on their own, but clauses will enhance the user-experience in grabbing more records. Meaning, you can use `.select()` alone, and it will behave like a regular `SELECT` command, where it will grab all records from that table. Alternatively, you may prepend [Clause Functions](#clause-functions) before firing the explicit transaction function, and those clauses will be added to the transaction function.

## Implicit Transaction Functions

Implicit transaction functions will consist of a function that ignores all clauses, and instead works off of a record's primary key. In `MyORM`, these functions will be:  
  - `.update()`
  - `.delete()`

Each of these functions will always work alone, meaning if a [clause function](#clause-functions) has been prepended to the statement, then it will not be used. In exchange for this implicit implementation, the model will assume and require you to have the primary key (per the table) associated as a property within the record or records being worked on.

# Clause Functions

Clause Functions, in this context, are defined as functions that work with [Explicit Transaction Functions](#explicit-transaction-functions) to assist building a command to be sent to your database. In `MyORM`, these functions and their syntax will be:  
  - `.where(modelCallback: (model: {[K in keyof TTableModel]: WhereBuilder}))`: Applies filtering conditions to the query.
    - Table `TTableModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `WhereBuilder`: Class used to assist in building the `WHERE` condition.
        - `.equals(value: TPropertyType)`: Adds a condition where a column's value must be equal to the `value` provided.
        - Synonym: `.eq(value: TPropertyType)`
        - `.notEquals(value: TPropertyType)`: Adds a condition where a column's value must NOT be equal to the `value` provided.
        - Synonym: `.neq(value: TPropertyType)`
        - `.lessThan(value: TPropertyType)`: Adds a condition where a column's value must be less than the `value` provided.
        - Synonym: `.lt(value: TPropertyType)`
        - `.lessThanOrEqualTo(value: TPropertyType)`: Adds a condition where a column's value must be less than or equal to the `value` provided.
        - Synonym: `.lteq(value: TPropertyType)`
        - `.greaterThan(value: TPropertyType)`: Adds a condition where a column's value must be greater than the `value` provided.
        - Synonym: `.gt(value: TPropertyType)`
        - `.greaterThanOrEQualTo(value: TPropertyType)`: Adds a condition where a column's value must be greater than or equal to the `value` provided.
        - Synonym: `.gteq(value: TPropertyType)`
        - `.in(values: TPropertyType[])`: Adds a condition where a column's value must be equal to one of the `values` provided.
        - `.contains(value: string)`: Adds a condition where a column's value must contain the string `value` provided.
        - `.like(value: string)`: Adds a condition where a column's value is like the string `value` provided, where the definition of like in this context is SQL's `LIKE` syntax.
        - Each of the functions above return the following functions:
            - `.and(modelCallback: (model: {[K in keyof TTableModel]: WhereBuilder}))`: Nests the condition with a conditional `AND`.
            - `.or(modelCallback: (model: {[K in keyof TTableModel]: WhereBuilder}))`: Nests the condition with a conditional `OR`.
            - Each of the `.and()` and `.or()` functions return a new reference of themselves. These chain the condition with a conditional `AND` or `OR`, respectively.
        - `TPropertyType` represents the respective type to the property you reference from the `model` in `modelCallback`.
  - `.groupBy(modelCallback: (model: TTableModel) => TAliasedType, aggregates: Aggregates)`: Applies grouping to the query as defined by SQL's `GROUP BY` syntax.
    - Table `TTableModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `TAliasedType`: The new type your query will work on from all calls thereafter.
    - `Aggregates`: 
  - `.sortBy(modelCallback: (model: {[K in keyof TTableModel]: SortByKeyConfig<TTableModel> & DirectionCallbacks<TTableModel>}) => SortByKeyConfig<TTableModel>|SortByKeyConfig<TTableModel>[])`: Applies sorting conditions to the query based off the keys and directions specified.
    - Table `TTableModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `SortByKeyConfig`: Represents an interface of `{ column: keyof TTableModel, direction: "ASC"|"DESC" }`. 
    - `DirectionCallbacks`: Represents an interface of `{ asc: () => SortByKeyConfig, desc: () => SortByKeyConfig }`.
      - __NOTE: Neither of the following functions are required to be called, the default is ascending order.__
      - `.asc()`: Marks the direction to sort to be ascending.
        - Synonym: `.ascending()`
      - `.desc()`: Marks the direction to sort to be descending.
        - Synonym: `.descending()`
  - `.take(limit: number)`: Applies a limit to the number of records to get from the query.
  - `.skip(offset: number)`: Applies an offset to where the records should start to get queried.

Each of these functions will only be applied when using an [explicit transaction function](#explicit-transaction-functions). This will apply the clauses built using the above functions to that respective explicit transaction function. These functions will also return a reference to a new context, that can be further chained with more clauses or transformed into a [view](#programmatic-views)

## .where()

The `.where()` function is a complex function, as it has to cover nesting and chaining of conditions.  

The `.where()` function takes in a callback function, where there is one argument, `model`, which is a type of the original model that you provided during construction. This `model` object works on a proxy, where an intercept will take the property you reference and create a new `WhereBuilder` out of it.  

### __WhereBuilder__

You will never construct a `WhereBuilder` class object directly, it will only ever be created for you to use in your `modelCallback` in your `.where()` function.  

The `WhereBuilder` class provides a library of functions for constructing conditions, like checking if a column value is equal to a variable, etc.

In a library like Entity Framework Core (EFC), the syntax uses the actual programming language's operators, however, JavaScript doesn't provide a way to override operators, and so it isn't feasible to mimic this behavior, therefore, you will follow these functions:

  - `WhereBuilder`: Class used to assist in building the `WHERE` condition.
    - `.not()`: Negates the following condition.
    - `.equals(value: TPropertyType)`: Adds a condition where a column's value must be equal to the `value` provided.
      - Synonym: `.eq(value: TPropertyType)`
    - `.notEquals(value: TPropertyType)`: Adds a condition where a column's value must NOT be equal to the `value` provided.
      - Synonym: `.neq(value: TPropertyType)`
    - `.lessThan(value: TPropertyType)`: Adds a condition where a column's value must be less than the `value` provided.
      - Synonym: `.lt(value: TPropertyType)`
    - `.lessThanOrEqualTo(value: TPropertyType)`: Adds a condition where a column's value must be less than or equal to the `value` provided.
      - Synonym: `.lteq(value: TPropertyType)`
    - `.greaterThan(value: TPropertyType)`: Adds a condition where a column's value must be greater than the `value` provided.
      - Synonym: `.gt(value: TPropertyType)`
    - `.greaterThanOrEqualTo(value: TPropertyType)`: Adds a condition where a column's value must be greater than or equal to the `value` provided.
      - Synonym: `.gteq(value: TPropertyType)`
    - `.in(values: TPropertyType[])`: Adds a condition where a column's value must be equal to one of the `values` provided.
    - `.contains(value: string)`: Adds a condition where a column's value must contain the string `value` provided.
    - `.like(value: string)`: Adds a condition where a column's value is like the string `value` provided, where the definition of like in this context is SQL's `LIKE` syntax.
    - Each of the functions above return the following functions:
      - `.and(modelCallback: (model: {[K in keyof TTableModel]: WhereBuilder}))`: Nests the condition with a conditional `AND`.
      - `.or(modelCallback: (model: {[K in keyof TTableModel]: WhereBuilder}))`: Nests the condition with a conditional `OR`.
      - Each of the `.and()` and `.or()` functions return a new reference of themselves. These chain the condition with a conditional `AND` or `OR`, respectively.
    - `TPropertyType` represents the respective type to the property you reference from the `model` in `modelCallback`.

As mentioned above, each of these functions will return a `.and()` and `.or()` function. These functions will take the same exact syntax as what you pass into your `.where()` function.  

### __.where() negation__

Negating an entire condition can be useful for situations where you may want to avoid attempting to rewrite your conditions, therefore the `WhereBuilder` provides a helpful function, `.not()`, to negate the entirety of the next condition.

Additionally, if you'd like to negate the entire condition as a whole, you can use the `.whereNot()` function.

Here is an example of negating a series of conditions:

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';
const pool = createMySql2Pool({ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'});
const customerCtx = new MyORMContext<Customer>(adapter(pool), "Customer");

const customers = await customerCtx
    .where(m => m.FirstName.equals("John")
        .and(m => m.LastName.not().equals("Doe")))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Customer`.`CustomerId` AS `CustomerId`
        ,`Customer`.`FirstName` AS `FirstName`
        ,`Customer`.`LastName` AS `LastName`
        ,`Customer`.`Company` AS `Company`
        ,`Customer`.`Address` AS `Address`
        ,`Customer`.`City` AS `City`
        ,`Customer`.`State` AS `State`
        ,`Customer`.`Country` AS `Country`
        ,`Customer`.`PostalCode` AS `PostalCode`
        ,`Customer`.`Phone` AS `Phone`
        ,`Customer`.`Fax` AS `Fax`
        ,`Customer`.`Email` AS `Email`
        ,`Customer`.`SupportRepId` AS `SupportRepId`
    FROM Customer
    WHERE `Customer`.`FirstName` = 'John'
        AND NOT `Customer`.`LastName` = 'Doe'
```

And here is an example of negating all conditions:

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';
const pool = createMySql2Pool({ host: 'localhost', port: 3306, user: 'root', password: 'root', database: 'digital_store_media'});
const customerCtx = new MyORMContext<Customer>(adapter(pool), "Customer");

const customers = await customerCtx
    .whereNot(m => m.FirstName.equals("John")
        .and(m => m.LastName.equals("Doe")))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Customer`.`CustomerId` AS `CustomerId`
        ,`Customer`.`FirstName` AS `FirstName`
        ,`Customer`.`LastName` AS `LastName`
        ,`Customer`.`Company` AS `Company`
        ,`Customer`.`Address` AS `Address`
        ,`Customer`.`City` AS `City`
        ,`Customer`.`State` AS `State`
        ,`Customer`.`Country` AS `Country`
        ,`Customer`.`PostalCode` AS `PostalCode`
        ,`Customer`.`Phone` AS `Phone`
        ,`Customer`.`Fax` AS `Fax`
        ,`Customer`.`Email` AS `Email`
        ,`Customer`.`SupportRepId` AS `SupportRepId`
    FROM Customer
        WHERE NOT `Customer`.`FirstName` = 'John'
        AND `Customer`.`LastName` = 'Doe'
```

### __.where() chaining__

This is where things might get confusing--  

When we work with any language with boolean or mathematical operators, we need to specify a precedence... there is no precedence in SQL. Everything is read from left to right, so therefore, nesting and chaining is extremely important.  

`MyORM` provides a way to nest and chain indefinitely as long as you follow these two rules.

  - If you want to chain your conditions, add `.and()` or `.or()` on the `.and()` or `.or()` you want to chain to.
  - If you want to nest your conditions, add `.and()` or `.or()` on the condition operators from `WhereBuilder` (e.g., `.eq()`, `.lt()`, etc.)

If you follow these two rules, you'll accomplish what you want.  

There is one drawback to these two rules, your code can get messy, as there will be many parentheses and nests.

### __.where() tips and tricks__

The best way to work with a `.where()` function is to write it like it is literal SQL syntax. Take this excerpt for example:

```sql
SELECT Composer AS c, Bytes AS b, Name AS n 
    FROM Track AS t
    WHERE c = 'AC/DC'
        AND b > 1
        AND n = 'Dog Eat Dog'
        OR (c = 'Apocalyptica'
            AND (b > 200
                OR n = 'Enter Sandman'));
```

Using the `myorm` library, this would look like:

```ts
await trackCtx
    .where(m => m.Composer.equals("AC/DC")
        .and(m => m.Bytes.greaterThan(1))
        .and(m => m.Name.equals("Dog Eat Dog"))
        .or(m => m.Composer.equals("Apocalyptica")
            .and(m => m.Bytes.greaterThan(200)
                .or(m => m.Name.equals("Enter Sandman")))))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        AND `Track`.`Bytes` > 1
        AND `Track`.`Name` = 'Dog Eat Dog'
        OR (`Track`.`Composer` = 'Apocalyptica'
            AND (`Track`.`Bytes` > 200
                OR `Track`.`Name` = 'Enter Sandman'))
```

If you chain conditions together with `AND` or `OR`, then you should keep them inline with eachother.  
If you nest conditions together with `AND` or `OR`, then you should nest them in with a `TAB` or `SPACE`.  

These conventions may save you later on, but it is still confusing because you can easily have a closing parentheses `)` in the wrong spot. As a matter of fact, this has stumped me while writing this library, so be on the look out.  

### __.where() examples__

Example of querying from `digital_media_store.Track` given one condition, `WHERE c1`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.equals("AC/DC"))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
```

Example of querying from `digital_media_store.Track` given two conditions, `WHERE c1 AND c2`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.equals("AC/DC")
        .and(m => m.Name.equals("Dog Eat Dog")))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        AND `Track`.`Name` = 'Dog Eat Dog'
```

Example of querying from `digital_media_store.Track` given three conditions, `WHERE c1 AND (c2 OR c3)`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.equals("AC/DC")
        .and(m => m.Name.equals("Dog Eat Dog")
            .or(m => m.Name.equals("Go Down"))))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        AND (`Track`.`Name` = 'Dog Eat Dog'
            OR `Track`.`Name` = 'Go Down')
```

Example of querying from `digital_media_store.Track` given four conditions, `WHERE (c1 OR c2) AND (c2 OR c3)`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.equals("AC/DC")
        .or(m => m.Composer.equals("Apocalyptica"))
        .and(m => m.Name.equals("Dog Eat Dog")
            .or(m => m.Name.equals("Enter Sandman"))))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        OR `Track`.`Composer` = 'Apocalyptica'
        AND (`Track`.`Name` = 'Dog Eat Dog'
            OR `Track`.`Name` = 'Enter Sandman')
```

This last example will go more into the functions you have access to, as well as going deep into the complexity of chaining and nesting.

Example of querying from `digital_media_store.Track` given nine (9) conditions:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.equals("AC/DC")
        .and(m => m.Name.equals("Dog Eat Dog")
            .or(m => m.Name.contains("go")
                .and(m => m.Name.contains("down")
                    .and(m => m.Bytes.lessThan(2 ** 53))))
            .or(m => m.Name.contains("let")
                .and(m => m.Name.contains("rock")
                    .and(m => m.Bytes.lessThan(2 ** 53)))))
        .and(m => m.AlbumId.equals(4)))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        AND (`Track`.`Name` = 'Dog Eat Dog'
            OR (`Track`.`Name` LIKE '%go%'
                AND (`Track`.`Name` LIKE '%down%'
                    AND `Track`.`Bytes` < 9007199254740992))
            OR (`Track`.`Name` LIKE '%let%'
                AND (`Track`.`Name` LIKE '%rock%'
                    AND `Track`.`Bytes` < 9007199254740992)))
        AND `Track`.`AlbumId` = 4
```

## .sortBy()

The `.sortBy()` function is used to apply an `ORDER BY` clause to your query, to sort the records in a specific order.

Unlike the `.where()` function, the `.sortBy()` function will override any pre-existing `.sortBy()` calls.

The `.sortBy()` function takes in a callback function, where there is one argument, `model`, which is a type of the original model that you provided during construction. This `model` object works on a proxy, where an intercept will take the property you reference and return itself a long with four (4) functions you can use to specify the direction, `.asc()`, `.ascending()`, `.desc()`, and `.descending()`.  

If you wish to sort by one key, you just need to specify the one property and direction alone. If you want to sort by multiple keys, you need to wrap all of the property/direction references in an array.

You do **NOT** need to specify one of the four direction functions. The default is ascending order, as SQL syntax intends.

### .sortBy() examples

Example of querying from `digital_media_store.Track` sorted in ascending order by `Bytes` (implicit):

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .sortBy(m => m.Bytes)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    ORDER BY Bytes ASC
```

Example of querying from `digital_media_store.Track` sorted in ascending order by `Bytes` (explicit):

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .sortBy(m => m.Bytes.asc())
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    ORDER BY Bytes ASC
```

Example of querying from `digital_media_store.Track` sorted in descending order by `Bytes`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .sortBy(m => m.Bytes.desc())
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    ORDER BY Bytes DESC
```

Example of querying from `digital_media_store.Track` sorted in descending order by `Composer`, then in ascending order by `Bytes`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .sortBy(m => [m.Composer.desc(), m.Bytes])
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    ORDER BY Composer DESC
        ,Bytes ASC
```

## .groupBy()

__NOTE: GROUP BY documentation is still under construction...__

Grouping in SQL can yield some additional information you may want a User to see.  

In some situations, you may want to see how many customers you may have per country, and this is where the `.groupBy()` function will be useful.

The syntax for `.groupBy()` follows the same pattern as the rest of `MyORM`-- a modelcallback should be provided. In this scenario, the return type is the main factor we want to look at.

The return type for each property reference on your `model` in the `modelCallback` returns the property name itself.  

Additionally, the `modelCallback` provides an extra parameter for use, called `aggregates`. This parameter is an object with six (6) functions available for aggregate data use.

Here is the full syntax for `.groupBy()`:
  - `.groupBy((model: TTableModel, aggregates: Aggregates) => string|string[])`: Group the specified columns into the query a long with the aggregates also specified.
    - `<TTableModel>`: Model representing the table in the context.
    - `<Aggregates>`: Object holding functions for aggregate data use.
      - `total: () => string`: Gets the total number of records within each group.
      - `count: (col: keyof TTableModel) => string`: Gets the total number of records with a distinct column, `col`.
      - `avg: (col: keyof TTableModel) => string`: Gets the average of that column across that group.
      - `min: (col: keyof TTableModel) => string`: Gets the minimum of that column across that group.
      - `max: (col: keyof TTableModel) => string`: Gets the maximum of that column across that group.
      - `sum: (col: keyof TTableModel) => string`: Gets the total sum of that column across that group.

__The return type for the `modelCallback` says `string|string[]` above, but it is actually a lot more intuitive than that. The return type has to be a key of `TTableModel` or it has to be some special variation conconcted by `MyORM` for an aggregate.__

With that being said, each aggregate function uses some special `lisp` technology, where `TypeScript` will break down and rebuild the string of the key passed into the aggregate function, then return a new variation that looks like this: `${aggr}_{col}` or if the column is on an included table: `${aggr}_{table}_{col}`. (`{aggr}` being "count"/"avg"/"min"/"max"/"sum" and `{col}` being some property from `TTableModel`.)

Since that is the return type for all of those functions, that means each record returned from a query will have their respective aggregate in that same notation as a property.

__NOTE: For joined tables, you will get a slightly different result, especially for tables that are configured as a one-to-many relationship. For example, in a one-to-many related inclusion, if you group a column from that included table, then the table's property will not be an array, as you would expect-- it will be a singular object, nesting all the way down to the column you grouped on. There is an example down below that explains more.__

### .groupBy() examples

Here is an example of grouping by `Track`.`Composer` with no aggregates:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .groupBy(m => m.Composer)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer`
	FROM Track
	GROUP BY `Track`.`Composer`
```

This will generate the following results:

```
[
  { Composer: 'Angus Young, Malcolm Young, Brian Johnson' },
  { Composer: null },
  { Composer: 'F. Baltes, S. Kaufman, U. Dirkscneider & W. Hoffman' },
  {
    Composer: 'F. Baltes, R.A. Smith-Diesel, S. Kaufman, U. Dirkscneider & W. Hoffman'
  },
  { Composer: 'Deaffy & R.A. Smith-Diesel' },
  { Composer: 'AC/DC' },
  { Composer: 'Steven Tyler, Joe Perry, Jack Blades, Tommy Shaw' },
  { Composer: 'Steven Tyler, Joe Perry' },
  { Composer: 'Steven Tyler, Joe Perry, Jim Vallance, Holly Knight' },
  { Composer: 'Steven Tyler, Joe Perry, Desmond Child' },
  ...
]
```

Here is an example of grouping by `Track`.`Composer` and `Track`.`AlbumId` with no aggregates:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .groupBy(m => [m.Composer, m.AlbumId])
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer`
		,`Track`.`AlbumId`
	FROM Track
	GROUP BY `Track`.`Composer`,`Track`.`AlbumId`
```

This will generate the following results:

```
[
  { Composer: 'Angus Young, Malcolm Young, Brian Johnson', AlbumId: 1 },
  { Composer: null, AlbumId: 2 },
  {
    Composer: 'F. Baltes, S. Kaufman, U. Dirkscneider & W. Hoffman',
    AlbumId: 3
  },
  ...
]
```

Here is an example of grouping by `Track`.`Composer` with all aggregates with `Bytes`, except for `count()`, where that will be on `AlbumId`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .groupBy((m, { total, count, avg, min, max, sum }) => [m.Composer, total(), count(m.AlbumId), avg(m.Bytes), min(m.Bytes), max(m.Bytes), sum(m.Bytes)])
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer`
		,COUNT(*) AS $total
		,COUNT(DISTINCT `Track`.`AlbumId`) AS `$count_AlbumId`
		,AVG(`Track`.`Bytes`) AS `$avg_Bytes`
		,MIN(`Track`.`Bytes`) AS `$min_Bytes`
		,MAX(`Track`.`Bytes`) AS `$max_Bytes`
		,SUM(`Track`.`Bytes`) AS `$sum_Bytes`
	FROM Track
	GROUP BY `Track`.`Composer`
```

This will generate the following results:

```
[
  {
    Composer: null,
    '$total': 978,
    '$count_AlbumId': 82,
    '$avg_Bytes': 97897024.002,
    '$min_Bytes': 161266,
    '$max_Bytes': 1059546140,
    '$sum_Bytes': 95743289474
  },
  {
    Composer: 'A. F. Iommi, W. Ward, T. Butler, J. Osbourne',
    '$total': 3,
    '$count_AlbumId': 1,
    '$avg_Bytes': 7655450.6667,
    '$min_Bytes': 5609799,
    '$max_Bytes': 11626740,
    '$sum_Bytes': 22966352
  },
  {
    Composer: 'A. Jamal',
    '$total': 1,
    '$count_AlbumId': 1,
    '$avg_Bytes': 8980400,
    '$min_Bytes': 8980400,
    '$max_Bytes': 8980400,
    '$sum_Bytes': 8980400
  },
  ...
]
```


Here is an example of grouping `Playlist` on the joined `PlaylistTrack` and `Track` for `Playlist`.`Name` and `Track`.`Composer`, as well as the same aggregate information as above. (Getting data about playlists)

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const playlistCtx = new MyORMContext<Playlist>(adapter(pool), "Playlist"); 
// ... hasOne and hasMany configurations...
const playlists = await playlistsCtx
    .include(m => m.PlaylistTracks.thenInclude(m => m.Track))
    .groupBy((m, { total, count, avg, min, max, sum }) => [
        m.Name,
        m.PlaylistTracks.Track.Composer,
        total(),
        count(m.PlaylistTracks.Track.AlbumId),
        avg(m.PlaylistTracks.Track.Bytes),
        min(m.PlaylistTracks.Track.Bytes),
        max(m.PlaylistTracks.Track.Bytes),
        sum(m.PlaylistTracks.Track.Bytes)
    ])
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Playlist`.`Name`
		,`Track`.`Composer` AS `PlaylistTracks_Track_Composer`
		,COUNT(*) AS $total
		,COUNT(DISTINCT `Track`.`AlbumId`) AS `$count_PlaylistTracks_Track_AlbumId`
		,AVG(`Track`.`Bytes`) AS `$avg_PlaylistTracks_Track_Bytes`
		,MIN(`Track`.`Bytes`) AS `$min_PlaylistTracks_Track_Bytes`
		,MAX(`Track`.`Bytes`) AS `$max_PlaylistTracks_Track_Bytes`
		,SUM(`Track`.`Bytes`) AS `$sum_PlaylistTracks_Track_Bytes`
	FROM Playlist
		LEFT JOIN `PlaylistTrack` ON `Playlist`.`PlaylistId`=`PlaylistTrack`.`PlaylistId`
		LEFT JOIN `Track` ON `PlaylistTrack`.`TrackId`=`Track`.`TrackId`
	GROUP BY `Playlist`.`Name`,`Track`.`Composer`
```

This will generate the following results:

```
[
  {
    Name: '90\x92s Music',
    PlaylistTracks: { Track: [Object] },
    '$total': 267,
    '$count_PlaylistTracks_Track_AlbumId': 26,
    '$avg_PlaylistTracks_Track_Bytes': 7611219.4195,
    '$min_PlaylistTracks_Track_Bytes': 161266,
    '$max_PlaylistTracks_Track_Bytes': 17533664,
    '$sum_PlaylistTracks_Track_Bytes': 2032195585
  },
  {
    Name: '90\x92s Music',
    PlaylistTracks: { Track: [Object] },
    '$total': 1,
    '$count_PlaylistTracks_Track_AlbumId': 1,
    '$avg_PlaylistTracks_Track_Bytes': 13065612,
    '$min_PlaylistTracks_Track_Bytes': 13065612,
    '$max_PlaylistTracks_Track_Bytes': 13065612,
    '$sum_PlaylistTracks_Track_Bytes': 13065612
  },
  {
    Name: '90\x92s Music',
    PlaylistTracks: { Track: [Object] },
    '$total': 2,
    '$count_PlaylistTracks_Track_AlbumId': 1,
    '$avg_PlaylistTracks_Track_Bytes': 8069559.5,
    '$min_PlaylistTracks_Track_Bytes': 7529336,
    '$max_PlaylistTracks_Track_Bytes': 8609783,
    '$sum_PlaylistTracks_Track_Bytes': 16139119
  },
  ...
]
```

__Note: As you can see, although you may expect `PlaylistTracks` to be an array, it is not, and is instead a pure object. When grouping in `MyORM`, there is no reason to smush records together anymore, as the whole point of grouping is for each result to be a unique group containing distinct data about the group as a whole.__

## .take() and .skip()

__NOTE: As mentioned in this section, you can use `.take()` whenever you'd like, but in order to use `.skip()`, you **MUST** also use `.take()`.__

The `.take()` and `.skip()` functions are the simplest, and barely warrant a reason to have a section for them, but there are a few notes to mention on these functions.  

The function `.take()` will limit the number of records your query will grab specified by the argument passed into `.take()`.  

The function `.skip()` will skip the number of records specified by the argument passed into `.take()`, and start at the next index. Since MySQL does not support `OFFSET` without a `LIMIT`, you **MUST** use `.take()` in conjunction with `.take()`, otherwise, you will receive a `MyORMSyntaxError`.

### __.take() examples__

Example of querying the first 5 records from `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .take(5)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    LIMIT 5
```

### __.skip() examples__

Example of querying the first 5 records **AFTER** skipping the first 10 records. from `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx
    .skip(10)
    .take(5)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
    LIMIT 5
    OFFSET 10
```

# Aliasing

Aliasing provides a way to make an interface to your database and being able to work with objects in JavaScript while maintaining conventions. It also just provides a way to make things more readable. The core of aliasing is actually just specifying a JavaScript `Array.map` function, so that it will automatically do it for you before returning any records, so treat this function exactly as you would a JavaScript `Array.map()` function. (meaning, if you have one-to-many records, you should use `.map` on that too)  

Aliasing is easy in `MyORM`, as all you need to do is specify an object mapped to the string variant of the column you want to alias. The only difference that is nice here is that you can reference a `model` in your `.alias()` function to see the columns you have access to.

The `.alias()` function, like many other functions in the `MyORMContext` class, returns a new `MyORMContext` with updated type parameters so TypeScript can pick up what you aliased. This means you can actually save that context to another variable and reference it consistently.

The syntax for `.alias()` is as follows:

  - `.alias(modelCallback: (model: TTableModel) => TAliasedType)`
    - Table `TTableModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `TAliasedType`: The object type you provide from the callback function.

Another synonym for `.alias()` is `.map()`.

__You can also alias the same column to multiple aliases, although, there probably isn't much of a reason for this, the functionality is there.__

## .alias() examples

Example of aliasing `digital_media_store.Track` for future reference:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracksAliased = trackCtx.alias(m => ({
    composer: m.Composer,
    bytes: m.Bytes
}));
```

__NOTE: JavaScript syntax requires you to wrap an immediate returning object (from a lambda function) with a parentheses so it parses it as an object and not as a function body.__

Intellisense will pick up the type like:

![image](https://user-images.githubusercontent.com/55516053/230825813-b64e29a5-9b7c-4cae-9e3d-3d90a22d0d54.png)

Or when referencing the return type from a `.select()` like:

![image](https://user-images.githubusercontent.com/55516053/230825980-9808770c-21b9-4caf-b7ab-bc8539be3425.png)

Example of using `.select()` from the above aliased context:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracksAliased = trackCtx.alias(m => ({
    composer: m.Composer,
    bytes: m.Bytes
}));
const ts = await tracksAliased.select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer` AS `composer`
        ,`Track`.`Bytes` AS `bytes`
    FROM `Track`
```

Example of aliasing a table with an included one-to-one relating table:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
trackCtx.hasOne(m => m.Artist.withKeys("Composer", "Name"));
const tracksAliased = await trackCtx.include(m => m.Artist)
    .alias(m => ({
        id: m.TrackId,
        name: m.Name,
        $: m.UnitPrice,
        artist: {
            artistId: m.Artist.ArtistId,
            artistName: m.Artist.Name
        }
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
        ,`Track`.`Name` AS `Name`
        ,`Track`.`AlbumId` AS `AlbumId`
        ,`Track`.`MediaTypeId` AS `MediaTypeId`
        ,`Track`.`GenreId` AS `GenreId`
        ,`Track`.`Composer` AS `Composer`
        ,`Track`.`Milliseconds` AS `Milliseconds`
        ,`Track`.`Bytes` AS `Bytes`
        ,`Track`.`UnitPrice` AS `UnitPrice`
        ,`Artist`.`ArtistId` AS `Artist_ArtistId`
        ,`Artist`.`Name` AS `Artist_Name`
    FROM `Track`
        LEFT JOIN `Artist` ON `Track`.`Composer`=`Artist`.`Name`
```

Example of aliasing a table with an included one-to-many relating table:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const playlistsCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
playlistsCtx.hasMany(m => m.PlaylistTracks.withKeys("PlaylistId", "PlaylistId")
    .andThatHasOne(m => m.Track.withKeys("TrackId", "TrackId")));
const playlistsAliased = await playlistsCtx.include(m => m.PlaylistTracks.thenInclude(m => m.Track))
    .alias(m => ({
        id: m.PlaylistId,
        tracks: m.PlaylistTracks.map(pt => ({
            id: pt.Track.TrackId,
            name: pt.Track.Name
        }))
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Playlist`.`PlaylistId` AS `PlaylistId`
        ,`Playlist`.`Name` AS `Name`  
        ,`PlaylistTrack`.`PlaylistId` AS `PlaylistTracks_PlaylistId`
        ,`PlaylistTrack`.`TrackId` AS `PlaylistTracks_TrackId`
        ,`Track`.`TrackId` AS `PlaylistTracks_Track_TrackId`
        ,`Track`.`Name` AS `PlaylistTracks_Track_Name`
        ,`Track`.`AlbumId` AS `PlaylistTracks_Track_AlbumId`
        ,`Track`.`MediaTypeId` AS `PlaylistTracks_Track_MediaTypeId`
        ,`Track`.`GenreId` AS `PlaylistTracks_Track_GenreId`
        ,`Track`.`Composer` AS `PlaylistTracks_Track_Composer`
        ,`Track`.`Milliseconds` AS `PlaylistTracks_Track_Milliseconds`
        ,`Track`.`Bytes` AS `PlaylistTracks_Track_Bytes`
        ,`Track`.`UnitPrice` AS `PlaylistTracks_Track_UnitPrice`
    FROM `Playlist`
        LEFT JOIN `PlaylistTrack` ON `Playlist`.`PlaylistId`=`PlaylistTrack`.`PlaylistId`
        LEFT JOIN `Track` ON `PlaylistTrack`.`TrackId`=`Track`.`TrackId`
```

__NOTE: As of v1.0, **ALL** aliased keys (included property keys in included objects) must be unique.__

As mentioned in the note above, all keys must be unique. If any key overlaps another, then a `MyORMSyntaxError` will be thrown.

# Querying

Much of the syntax in `MyORM` is built like how Microsoft built Entity Framework Core (EFC). There will be small things here and there that either lack or just aren't the same, and that's because performance would hinder due to the difficulties of implementation, or they are intended to be added for future updates.  

`MyORM` consists of the following explicit transaction functions for querying:
  - **ASYNC** `.select()`: Runs a query with all built clauses added to it.
  - **ASYNC** `.count()`: Runs a query for `COUNT(*)` with all built clauses added to it.

You can build clauses to filter or enhance the yield of what records you receive by using [clause functions](#clause-functions).

Every subsection following this will break down everything in more detail, with examples.

## .select() 

The `.select()` function is an [explicit transaction function](#explicit-transaction-functions) and will work alone or with clauses built using [clause functions](#clause-functions) to further filter/alter the records returned from the query.

### .select() examples

Example of querying all records from `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx.select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
		,`Track`.`Name` AS `Name`
		,`Track`.`AlbumId` AS `AlbumId`
		,`Track`.`MediaTypeId` AS `MediaTypeId`
		,`Track`.`GenreId` AS `GenreId`
		,`Track`.`Composer` AS `Composer`
		,`Track`.`Milliseconds` AS `Milliseconds`
		,`Track`.`Bytes` AS `Bytes`
		,`Track`.`UnitPrice` AS `UnitPrice`
    FROM `Track`
```

## .count()

The `.count()` function works exactly like the `.select()` function, but instead the result of the function call will be a number representing the total number of records that exist from that query.

### .count() examples

Example of querying the count of all records from `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const tracks = await trackCtx.select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT COUNT(*) AS `$$count` 
    FROM `Track`
```


# Inserting

__NOTE: As of v1.0, records that have included tables will be inserted, but the related table information will not be inserted.__

Inserting records only requires you to have an object that represents the record being inserted, or an aliased version of the record being inserted.

If the context detected an identity key (a key with the attribute, `AUTO_INCREMENT` applied to it) then all records inserted will be assigned an Id.

__WARNING: If you end up inserting a record that has a primary key specified (e.g., an existing record) then that record will be re-inserted as a duplicate.__

The syntax for `.insert()` is as follows:
  - `.insert(records: TAliasMap | TAliasMap[]): Promise<TAliasMap[]>`: Inserts all records (original or aliased) into the table while maintaining the state of the records if they get auto assigned an Id-- Returning the newest state of the records that were inserted.

## .insert() examples

Example of inserting one record into `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const track = await trackCtx.insert({
    TrackId: 99999,
    Name: "example track",
    AlbumId: 1,
    MediaTypeId: 1,
    GenreId: 1,
    Composer: "example composer",
    Milliseconds: 300 * 1000,
    Bytes: 500 * 1000,
    UnitPrice: 9.99
});
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
INSERT INTO `Track`
    (`Track`.`TrackId`
        , `Track`.`Name`
        , `Track`.`AlbumId`
        , `Track`.`MediaTypeId`
        , `Track`.`GenreId`
        , `Track`.`Composer`
        , `Track`.`Milliseconds`
        , `Track`.`Bytes`
        , `Track`.`UnitPrice`)
    VALUES (99999,'example track',1,1,1,'example composer',300000,500000,9.99)
```

Example of inserting one record into `digital_media_store.Track` when `Track` is aliased.

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track"); 
const track = await trackCtx
    .alias(m => ({
        id: m.TrackId,
        name: m.Name,
        albumId: m.AlbumId,
        mediaTypeId: m.MediaTypeId,
        genreId: m.GenreId,
        composer: m.Composer,
        ms: m.Milliseconds,
        bytes: m.Bytes,
        $: m.UnitPrice 
    }))
    .insert({
        id: 99999,
        name: "example track",
        albumId: 1,
        mediaTypeId: 1,
        genreId: 1,
        composer: "example composer",
        ms: 300 * 1000,
        bytes: 500 * 1000,
        $: 9.99
    });
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
INSERT INTO `Track`
    (`Track`.`TrackId`
        , `Track`.`Name`
        , `Track`.`AlbumId`
        , `Track`.`MediaTypeId`
        , `Track`.`GenreId`
        , `Track`.`Composer`
        , `Track`.`Milliseconds`
        , `Track`.`Bytes`
        , `Track`.`UnitPrice`)
    VALUES (99999,'example track',1,1,1,'example composer',300000,500000,9.99)
```

Example of inserting multiple records with all required properties filled out into `digital_media_store.Customer`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const cust = await customerCtx
    .insert([{
        CustomerId: 99995,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer1@test.com"
    }, {
        CustomerId: 99996,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer2@test.com"
    }, {
        CustomerId: 99997,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer3@test.com"
    }, {
        CustomerId: 99998,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer4@test.com"
    }, {
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer5@test.com"
    }]);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
INSERT INTO `Customer`
    (`Customer`.`CustomerId`
        , `Customer`.`FirstName`
        , `Customer`.`LastName`
        , `Customer`.`Email`)
    VALUES (99995,'test','customer','testcustomer1@test.com')
        ,(99996,'test','customer','testcustomer2@test.com')
        ,(99997,'test','customer','testcustomer3@test.com')
        ,(99998,'test','customer','testcustomer4@test.com')
        ,(99999,'test','customer','testcustomer5@test.com')
```

Example of inserting multiple records with all required properties filled out into `digital_media_store.Customer` when `Customer` is aliased:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const cust = await customerCtx
        .alias(m => ({
            id: m.CustomerId,
            first: m.FirstName,
            last: m.LastName,
            email: m.Email
        }))
        .insert([{
            id: 99995,
            first: "test",
            last: "customer",
            email: "testcustomer1@test.com"
        }, {
            id: 99996,
            first: "test",
            last: "customer",
            email: "testcustomer2@test.com"
        }, {
            id: 99997,
            first: "test",
            last: "customer",
            email: "testcustomer3@test.com"
        }, {
            id: 99998,
            first: "test",
            last: "customer",
            email: "testcustomer4@test.com"
        }, {
            id: 99999,
            first: "test",
            last: "customer",
            email: "testcustomer5@test.com"
        }]);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
INSERT INTO `Customer`
    (`Customer`.`CustomerId`
        , `Customer`.`FirstName`
        , `Customer`.`LastName`
        , `Customer`.`Email`)
    VALUES (99995,'test','customer','testcustomer1@test.com')
        ,(99996,'test','customer','testcustomer2@test.com')
        ,(99997,'test','customer','testcustomer3@test.com')
        ,(99998,'test','customer','testcustomer4@test.com')
        ,(99999,'test','customer','testcustomer5@test.com')
```

Example of inserting multiple records with all required properties and some nullable properties (different for each one) filled out into `digital_media_store.Customer`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const cust = await customerCtx
        .insert([{
            CustomerId: 99995,
            FirstName: "test",
            LastName: "customer",
            Email: "testcustomer1@test.com",
            City: "test city",
            Phone: "(333) 444-5555"
        }, {
            CustomerId: 99996,
            FirstName: "test",
            LastName: "customer",
            Email: "testcustomer2@test.com",
            Company: "test company"
        }, {
            CustomerId: 99997,
            FirstName: "test",
            LastName: "customer",
            Email: "testcustomer3@test.com",
            City: "test city 2"
        }, {
            CustomerId: 99998,
            FirstName: "test",
            LastName: "customer",
            Email: "testcustomer4@test.com",
            Fax: "(111) 222-3333",
            Phone: "(222) 333-4444"
        }, {
            CustomerId: 99999,
            FirstName: "test",
            LastName: "customer",
            Email: "testcustomer5@test.com",
            State: "AK"
        }]);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
INSERT INTO `Customer`
    (`Customer`.`CustomerId`
        , `Customer`.`FirstName`
        , `Customer`.`LastName`
        , `Customer`.`Email`
        , `Customer`.`City`
        , `Customer`.`Phone`
        , `Customer`.`Company`
        , `Customer`.`Fax`
        , `Customer`.`State`)
    VALUES (99995,'test','customer','testcustomer1@test.com','test city','(333) 444-5555',null,null,null)
        ,(99996,'test','customer','testcustomer2@test.com',null,null,'test company',null,null)
        ,(99997,'test','customer','testcustomer3@test.com','test city 2',null,null,null,null)
        ,(99998,'test','customer','testcustomer4@test.com',null,'(222) 333-4444',null,'(111) 222-3333',null)
        ,(99999,'test','customer','testcustomer5@test.com',null,null,null,null,'AK')
```

# Updating

With updating records, you are given the choice between an [explicit transaction function](#explicit-transaction-functions), `.updateSelect()` or [implicit transaction function](#implicit-transaction-functions), `.update()`. If your table has a primary key, and you know the value or values for the mapped primary key, then using `.update()` will handle everything for you, so that would be the better option.  

Sometimes you may want to update multiple records that all meet some similar criteria, which is where the explicit transaction function, `.updateSelect()`, is useful. Instead, you can specify the filter of what you'd want to update using `.where()`, and that would handle what is supposed to be updated.

The syntax for the `.update()` and `.updateSelect()` functions is as follows:
  - `.update(records: TAliasMap | TAliasMap[]): Promise<number>`: Updates all records (original or aliased) in the table, based on an primary key that exists in each record. This update occurs in one large transaction using `CASE WHEN` and `WHERE`. The returning number will be the result of how many records were affected by the update. __If a primary key does not exist on any record, then an error is thrown. (this may change to just not updating the record at all)__
  - `.updateSelect(propertiesToUpdate: Partial<TAliasMap>): Promise<number>`: Updates all records in the table to the property values specified in `propertiesToUpdate`, where the records that get updated are chosen based on a built WHERE clause using `.where()`. The returning number will be the result of how many records were affected by the update. __If no where clause was built, then an error is thrown. This error can be ignored by passing true into the `allowUpdateOnAll` property in the options during construction.__

## .update() examples

Example of updating one customer in `digital_media_store.Customer`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const [cust] = await custCtx
    .insert({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
cust.Email = 'testcustomer12@test.com';
const rowsAffected = await custCtx.update(cust);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
UPDATE `Customer`
    SET `CustomerId` = (CASE
            WHEN CustomerId = 99999 THEN 99999
            ELSE `CustomerId`
        END),
        `FirstName` = (CASE
            WHEN CustomerId = 99999 THEN 'test'
            ELSE `FirstName`
        END),
        `LastName` = (CASE
            WHEN CustomerId = 99999 THEN 'customer'
            ELSE `LastName`
        END),
        `Email` = (CASE
            WHEN CustomerId = 99999 THEN 'testcustomer12@test.com'
            ELSE `Email`
        END)
    WHERE `Customer`.`CustomerId` IN (99999)
```

Example of updating multiple records in `digital_media_store.Customer`:  

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const custs = await custCtx
    .insert([{
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    }, {
        CustomerId: 100000,
        FirstName: "test2",
        LastName: "customer",
        Email: "testcustomer3@test.com"
    }, {
        CustomerId: 100001,
        FirstName: "test3",
        LastName: "customer",
        Email: "testcustomer3@test.com"
    }]);
custs[0].Email = 'testcustomer1@test.com';
custs[1].Email = 'testcustomer2@test.com';
const rowsAffected = await custCtx.update(custs);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SET `CustomerId` = (CASE
            WHEN CustomerId = 99999 THEN 99999
            WHEN CustomerId = 100000 THEN 100000
            WHEN CustomerId = 100001 THEN 100001
            ELSE `CustomerId`
        END),
        `FirstName` = (CASE
            WHEN CustomerId = 99999 THEN 'test'
            WHEN CustomerId = 100000 THEN 'test2'
            WHEN CustomerId = 100001 THEN 'test3'
            ELSE `FirstName`
        END),
        `LastName` = (CASE
            WHEN CustomerId = 99999 THEN 'customer'
            WHEN CustomerId = 100000 THEN 'customer'
            WHEN CustomerId = 100001 THEN 'customer'
            ELSE `LastName`
        END),
        `Email` = (CASE
            WHEN CustomerId = 99999 THEN 'testcustomer1@test.com'
            WHEN CustomerId = 100000 THEN 'testcustomer2@test.com'
            WHEN CustomerId = 100001 THEN 'testcustomer3@test.com'
            ELSE `Email`
        END)
    WHERE `Customer`.`CustomerId` IN (99999,100000,100001)
```

Example of updating `digital_media_store.Customer` when `Customer` is aliased:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer")
    .alias(m => ({
        id: m.CustomerId,
        firstName: m.FirstName,
        lastName: m.LastName,
        email: m.Email
    })).asView(); 
const [cust] = await custCtx
    .insert({
        id: 9999,
        firstName: 'test',
        lastName: 'customer',
        email: 'testcustomer@test.com'
    });
cust.email = 'testcustomer12@test.com';
const rowsAffected = await custCtx.update(cust);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
UPDATE `Customer`
    SET `CustomerId` = (CASE
            WHEN CustomerId = 9999 THEN 9999
            ELSE `CustomerId`
        END),
        `FirstName` = (CASE
            WHEN CustomerId = 9999 THEN 'test'
            ELSE `FirstName`
        END),
        `LastName` = (CASE
            WHEN CustomerId = 9999 THEN 'customer'
            ELSE `LastName`
        END),
        `Email` = (CASE
            WHEN CustomerId = 9999 THEN 'testcustomer12@test.com'
            ELSE `Email`
        END)
    WHERE `Customer`.`CustomerId` IN (9999)
```

## .updateSelect() examples

Example of updating one customer in `digital_media_store.Customer`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const [cust] = await custCtx
    .insert({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
const rowsAffected = await custCtx
    .where(m => m.Email.equals("testcustomer@test.com"))
    .updateSelect({
        Email: "testcustomer12@test.com"
    });
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
UPDATE `Customer`
        SET `Email` = 'testcustomer12@test.com'
        WHERE `Customer`.`Email` = 'testcustomer@test.com'
```

Example of updating `digital_media_store.Customer` when `Customer` is aliased:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer")
    .alias(m => ({
        id: m.CustomerId,
        firstName: m.FirstName,
        lastName: m.LastName,
        email: m.Email
    })).asView(); 
const [cust] = await custCtx
    .insert({
        id: 99999,
        firstName: 'test',
        lastName: 'customer',
        email: 'testcustomer@test.com'
    });
cust.email = 'testcustomer12@test.com';
const rowsAffected = await custCtx.update(cust);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
UPDATE `Customer`
	SET `Email` = 'testcustomer12@test.com' 
	WHERE `Customer`.`Email` = 'testcustomer@test.com'
```

# Deleting

With deleting records, you are given the choice between an [explicit transaction function](#explicit-transaction-functions), `.deleteSelect()` or [implicit transaction function](#implicit-transaction-functions), `.delete()`. If your table has a primary key, and you know the value or values for the mapped primary key, then using `.delete()` will handle everything for you, so that would be the better option.  

Sometimes you may want to delete multiple records that all meet some similar criteria, which is where the explicit transaction function, `.deleteSelect()`, is useful. Instead, you can specify the filter of what you'd want to update using `.where()`, and that would handle what is supposed to be deleted.

The syntax for the `.delete()` and `.deleteSelect()` functions is as follows:
  - `.delete(records: TAliasMap | TAliasMap[]): Promise<number>`: Deletes all records (original or aliased) in the table, based on a primary key that exists in each record. This delete occurs in one transaction, checking if the primary key is `IN` a subset of Ids (the ids from all records passed in). The returning number will be the result of how many records were affected by the update. __If a primary key does not exist on any record, then an error is thrown. (this may change to just not updating the record at all)__
  - `.deleteSelect(): Promise<number>`: Deletes all records in the table, where the records that get deleted are chosen based on a built WHERE clause using `.where()`. The returning number will be the result of how many records were affected by the update. __If no where clause was built, then an error is thrown. This error can be ignored by passing true into the `allowUpdateOnAll` property in the options during construction.__

## .delete() examples

Example of deleting from `digital_media_store.Customer`:  

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const custs = await custCtx
    .insert({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
const rowsAffected = await custCtx
    .delete(custs);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
DELETE FROM `Customer`
	WHERE `Customer`.`CustomerId` IN (99999)
```

Example of deleting multiple records from `digital_media_store.Customer`: 

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const custs = await custCtx
    .insert({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
const rowsAffected = await custCtx
    .delete(custs);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
DELETE FROM `Customer`
	WHERE `Customer`.`CustomerId` IN (99999)
```

Example of deleting from `digital_media_store.Customer` when `Customer` is aliased:  

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer")
    .alias(m => ({
        id: m.CustomerId,
        firstName: m.FirstName,
        lastName: m.LastName,
        email: m.Email
    })).asView(); 
const custs = await custCtx
    .insert({
        id: 99999,
        firstName: "test",
        lastName: "customer",
        email: "testcustomer@test.com"
    });
const rowsAffected = await custCtx
    .delete(custs);
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
DELETE FROM `Customer`
	WHERE `Customer`.`CustomerId` IN (99999)
```

## .deleteSelect() examples

Example of deleting from `digital_media_store.Customer`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const custCtx = new MyORMContext<Customer>(adapter(pool), "Customer"); 
const cust = await custCtx
    .insert({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
const rowsAffected = await custCtx
    .where(m => m.Email.eq("testcustomer@test.com"))
    .deleteSelect();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
DELETE FROM `Customer`
    WHERE `Customer`.`CustomerId` = 99999
```

# Including

Including is short for joining tables. Before you can include these tables in your query, you need to configure foreign relationships. (these do not need to be real foreign relationships configured on your table)

## Configuring Relationships

The syntax for configuring your relationships is as follows:

  - `.hasOne(modelCallback: (m: FromWithCallbacks<TTableModel>) => void)`: Given the `modelCallback`, you will specify a column from your property (that represents the foreign table) to have a key that relates to a key in the original `TTableModel`.
    - Type `TTableModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - Type `FromWithCallbacks`:  `TTableModel` where the values are objects that has three callbacks, `.from(table: string)`, `withKeys(pKey: keyof TTableModel, fKey keyof TForeignTable)`, and `.withPrimary(key: string)`.
      - `.from(table: string)`: Specifies the table that the property is from. This will return the same object, but only with the properties, `.withKeys()` and `.withPrimary()`. **This is optional, and should only be used if the __PROPERTY__ (not the type) name is different from the actual Table name the foreign model represents.**
      - `.withKeys(pKey: keyof TTableModel, fKey: keyof TForeignModel)`: Specifies the key from the primary table and the key from the foreign table to join the tables on.
      - `.withPrimary(key: keyof TTableModel)`: Specifies the key from the primary table that the join is being done on. This will return another object with the function `.withForeign(key: keyof TForeignModel)`.
        - `.withForeign(key: keyof TForeignModel)`: Specifies the  key from the foreign table (`TForeignModel`) that the join is being done on.
  - `.hasMany(modelCallback: (m: FromWithCallbacks<TTableModel>) => void)`: Given the `modelCallback`, you will specify a column from your property (that represents the foreign table) to have a key that relates to a key in the original `TTableModel`.
    - Type `TTableModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - Type `FromWithCallbacks`:  `TTableModel` where the values are objects that has the two callbacks, `.from(table: string)` and `.with(key: string)`.
      - `.from(table: string)`: Specifies the table that the property is from. This will return the same object, but only with the properties, `.withKeys()` and `.withPrimary()`. **This is optional, and should only be used if the __PROPERTY__ (not the type) name is different from the actual Table name the foreign model represents.**
      - `.withKeys(pKey: keyof TTableModel, fKey: keyof TForeignModel)`: Specifies the key from the primary table and the key from the foreign table to join the tables on.
      - `.withPrimary(key: keyof TTableModel)`: Specifies the key from the primary table that the join is being done on. This will return another object with the function `.withForeign(key: keyof TForeignModel)`.
        - `.withForeign(key: keyof TForeignModel)`: Specifies the  key from the foreign table (`TForeignModel`) that the join is being done on.

Each of these functions will be type-safe where the model properties will only be of non-primitive types (excluding `Date`) to their respective functions.  

See the images below for examples.

`.hasOne()` VS code intellisense typing example:  

![image](https://user-images.githubusercontent.com/55516053/231056701-7d43388f-6bc6-49de-ac45-ffddbd1bebb2.png)

`.hasMany()` VS code intellisense typing example:

![image](https://user-images.githubusercontent.com/55516053/231057101-66a9d1d2-548f-402d-ab90-a68b0ed20d6a.png)

### .hasOne() and .hasMany() examples

Example for configuring a one-to-one relationship for `digital_media_store.Artist` on `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track");
trackCtx.hasOne(m => m.Artist.withKeys("Composer","Name"));
```

Example for configuring a one-to-many relationship for `digital_media_store.PlaylistTrack` on `digital_media_store.Playlist`.

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const playlistCtx = new MyORMContext<Playlist>(adapter(pool), "Playlist");
// since the property, "m.PlaylistTracks" is not the same as the table name, `PlaylistTrack`, we have to use `.from()` to properly set what it is. 
playlistCtx.hasMany(m => m.PlaylistTracks.from("PlaylistTrack").withKeys("PlaylistId","PlaylistId"));
```

## Including the tables (LEFT JOIN)

__NOTE: As of v1.0, you can query from tables with `.include()`, but inserting/updating/deleting does not extend the same behavior to included tables.__

Now that your relationships are configured, you can start to include your tables (or join them) using `.include()`.

The syntax for `.include()` is as follows:

  - `.include(modelCallback: (model: {[K in keyof Required<TAugmentedType>]: K}) => TSelectedKey|(TSelectedKey[]))`: Includes a table that has been configured from the `.hasOne()` or `.hasMany()` function in the query. This should return a string representing the table name being included or an array of strings representing the table names being included. (The property references will return their respective table names)

Additionally, when including a table in your query, you must also alias the table, otherwise you will get a `MyORMSyntaxError` exception. This is because `MyORM` can't possibly know which columns belong to your included table and will instead assume they all belong to your original query.  

Alternatively, instead of `.alias()`, you may instead use `.groupBy()` as it will achieve the same aliasing, but now your query will have a `GROUP BY` clause.

__NOTE: If you are including an array (a table configured as a one-to-many relationship), then you must wrap your alias object in an array.__

### .include examples

Example of including `digital_media_store.Artist` in a query from `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track");
trackCtx.hasOne(m => m.Artist.withKeys("Composer", "Name"));

const ts = await trackCtx.include(m => m.Artist)
    .take(5) // For example purposes, we are limiting the query to 5 records
    .alias(m => ({
        id: m.TrackId,
        name: m.Name,
        $: m.UnitPrice,
        artist: {
            artistId: m.Artist.ArtistId,
            artistName: m.Artist.Name
        }
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
        ,`Track`.`Name` AS `Name`
        ,`Track`.`AlbumId` AS `AlbumId`
        ,`Track`.`MediaTypeId` AS `MediaTypeId`
        ,`Track`.`GenreId` AS `GenreId`
        ,`Track`.`Composer` AS `Composer`
        ,`Track`.`Milliseconds` AS `Milliseconds`
        ,`Track`.`Bytes` AS `Bytes`
        ,`Track`.`UnitPrice` AS `UnitPrice`
        ,`Artist`.`ArtistId` AS `Artist_ArtistId`
        ,`Artist`.`Name` AS `Artist_Name`
    FROM `Track`
        LEFT JOIN `Artist` ON `Track`.`Composer`=`Artist`.`Name`
    LIMIT 5
```

`ts` will be the following result:

```
[
  {
    id: 15,
    name: 'Go Down',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' }
  },
  {
    id: 16,
    name: 'Dog Eat Dog',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' }
  },
  {
    id: 17,
    name: 'Let There Be Rock',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' }
  },
  {
    id: 18,
    name: 'Bad Boy Boogie',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' }
  },
  {
    id: 19,
    name: 'Problem Child',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' }
  }
]
```

Example of including `digital_media_store.Artist` and `digital_media_store.Album` in a query from `digital_media_store.Track`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track");
trackCtx.hasOne(m => m.Artist.withKeys("Composer", "Name"))
    .hasOne(m => m.Album.withKeys("AlbumId", "AlbumId"));

const ts = await trackCtx
    .include(m => m.Artist)
    .include(m => m.Album)
    .alias(m => ({
        id: m.TrackId,
        name: m.Name,
        $: m.UnitPrice,
        artist: {
            artistId: m.Artist.ArtistId,
            artistName: m.Artist.Name
        },
        album: {
            albumId: m.Album.AlbumId,
            title: m.Album.Title
        }
    }))
    .take(5) // For example purposes, we are limiting the query to 5 records
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
        ,`Track`.`Name` AS `Name`
        ,`Track`.`AlbumId` AS `AlbumId`
        ,`Track`.`MediaTypeId` AS `MediaTypeId`
        ,`Track`.`GenreId` AS `GenreId`
        ,`Track`.`Composer` AS `Composer`
        ,`Track`.`Milliseconds` AS `Milliseconds`
        ,`Track`.`Bytes` AS `Bytes`
        ,`Track`.`UnitPrice` AS `UnitPrice`
        ,`Album`.`AlbumId` AS `Album_AlbumId`
        ,`Album`.`Title` AS `Album_Title`
        ,`Album`.`ArtistId` AS `Album_ArtistId`
        ,`Artist`.`ArtistId` AS `Artist_ArtistId`
        ,`Artist`.`Name` AS `Artist_Name`
    FROM `Track`
        LEFT JOIN `Album` ON `Track`.`AlbumId`=`Album`.`AlbumId`
        LEFT JOIN `Artist` ON `Track`.`Composer`=`Artist`.`Name`
    LIMIT 5
```

`ts` will be the following result:

```
[
  {
    id: 15,
    name: 'Go Down',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 16,
    name: 'Dog Eat Dog',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 17,
    name: 'Let There Be Rock',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 18,
    name: 'Bad Boy Boogie',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 19,
    name: 'Problem Child',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  }
]
```

Example like above, but instead using `.groupBy()` in place of `.alias()`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(adapter(pool), "Track");
trackCtx.hasOne(m => m.Artist.withKeys("Composer", "Name"))
    .hasOne(m => m.Album.withKeys("AlbumId", "AlbumId"));

const ts = await trackCtx
    .include(m => m.Artist)
    .include(m => m.Album)
    .alias(m => ({
        id: m.TrackId,
        name: m.Name,
        $: m.UnitPrice,
        artist: {
            artistId: m.Artist.ArtistId,
            artistName: m.Artist.Name,
        },
        album: {
            albumId: m.Album.AlbumId,
            title: m.Album.Title,
        },
    }))
    .take(5) // For example purposes, we are limiting the query to 5 records
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`TrackId` AS `TrackId`
        ,`Track`.`Name` AS `Name`
        ,`Track`.`AlbumId` AS `AlbumId`
        ,`Track`.`MediaTypeId` AS `MediaTypeId`
        ,`Track`.`GenreId` AS `GenreId`
        ,`Track`.`Composer` AS `Composer`
        ,`Track`.`Milliseconds` AS `Milliseconds`
        ,`Track`.`Bytes` AS `Bytes`
        ,`Track`.`UnitPrice` AS `UnitPrice`
        ,`Album`.`AlbumId` AS `Album_AlbumId`
        ,`Album`.`Title` AS `Album_Title`
        ,`Album`.`ArtistId` AS `Album_ArtistId`
        ,`Artist`.`ArtistId` AS `Artist_ArtistId`
        ,`Artist`.`Name` AS `Artist_Name`
    FROM `Track`
        LEFT JOIN `Album` ON `Track`.`AlbumId`=`Album`.`AlbumId`
        LEFT JOIN `Artist` ON `Track`.`Composer`=`Artist`.`Name`
    LIMIT 5
```

`ts` will be the following result:

```
[
  {
    id: 15,
    name: 'Go Down',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 16,
    name: 'Dog Eat Dog',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 17,
    name: 'Let There Be Rock',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 18,
    name: 'Bad Boy Boogie',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  },
  {
    id: 19,
    name: 'Problem Child',
    '$': 0.99,
    artist: { artistId: 1, artistName: 'AC/DC' },
    album: { albumId: 4, title: 'Let There Be Rock' }
  }
]
```

__Coincidentally, this yields the same results__

Example of including `digital_media_store.PlaylistTrack` in a query from `digital_media_store.Playlist`:

```ts
const pool = createMySql2Pool({ database: "digital_media_store", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Playlist>(adapter(pool), "Playlist");
playlistCtx.hasMany(m => m.PlaylistTracks.fromTable("PlaylistTrack").withKeys("PlaylistId", "PlaylistId"));
const ps = await playlistCtx.include(m => m.PlaylistTracks)
    .take(5) // For example purposes, we are limiting the query to 5 records
    .alias(m => ({
        id: m.PlaylistId,
        name: m.Name,
        playlistTracks: m.PlaylistTracks.map(pt => ({
            pId: pt.PlaylistId,
            tId: pt.TrackId
        }))
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Playlist`.`PlaylistId` AS `PlaylistId`
                ,`Playlist`.`Name` AS `Name`
                ,`PlaylistTrack`.`PlaylistId` AS `PlaylistTracks_PlaylistId`
                ,`PlaylistTrack`.`TrackId` AS `PlaylistTracks_TrackId`
        FROM (SELECT * FROM `Playlist`
        LIMIT 5 ) AS `Playlist`
                LEFT JOIN `PlaylistTrack` ON `Playlist`.`PlaylistId`=`PlaylistTrack`.`PlaylistId`
```

`ts` will be the following result:

```
[
  {
    id: 1,
    name: 'Music',
    playlistTracks: [
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object],
      ... 3190 more items
    ]
  },
  { id: 2, name: 'Movies', playlistTracks: [] },
  {
    id: 3,
    name: 'TV Shows',
    playlistTracks: [
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object],
      ... 113 more items
    ]
  },
  { id: 4, name: 'Audiobooks', playlistTracks: [] },
  {
    id: 5,
    name: '90Â’s Music',
    playlistTracks: [
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object], [Object], [Object],
      [Object], [Object], [Object], [Object],
      ... 1377 more items
    ]
  }
]
```

# Managing State

State in `MyORM` can mean a lot to the consumer of this library. The intention of `MyORM` is to make it so you, the consumer, can consistently reuse the state of a context however much you want.  

For example, you may have an API where you always grab a group of users within a certain role-- In that case, you can create a static state of your context that always filters out users of that role.  

```ts
const users: MyORMContext<User> = new MyORMContext(adapterCnn, "User");
const admins = users.where(m => m.RoleName.equals("ADMIN"));

//express
async function GET_admins(req, res) {
    const { username, email } = req.query;

    let ctx = admins; // ctx is used to maintain the state
    if(username) {
        ctx = ctx.where(m => m.Username.contains(username));
    }
    if(email) {
        ctx = ctx.where(m => m.Email.contains(email));
    }

    const users = await ctx.select();

    res.send(JSON.stringify(users));
}

// api call: /admins will yield
/**
 * [
 *   {
 *     "Username": "johndoe2",
 *     "Email": "johndoe2@yahoo.com",
 *     "RoleName": "ADMIN"
 *   },
 *   {
 *     "Username": "janedoe2",
 *     "Email": "janedoe2@yahoo.com",
 *     "RoleName": "ADMIN"
 *   }
 * ]
 */
```

As you can see in the example above-- We save a static instance of `MyORMContext` with a new state with a `where` clause added to it.  

In `MyORM`, every time a new clause is added, a new context is created with a specific state. That state will __never__ alter, and therefore, the context will only ever construct a SQL command with those clauses added to it.  

If you need to dynamically add clauses to your query based on if some property exists, like the example above, you just need to maintain a variable corresponding to the final context you'd want to transact with.

# Logging

Logging is useful for reasons that doesn't need to be gone into.  

`MyORM` utilizes `node.js` Event Emitters to create unique logging events whenever a command is executed, holding different handlers for instances of success or failure.  

To add a logging listener to your table, you must use the `.onSuccess()` or `.onFail()` functions, additionally, you can choose what types of commands are logged, by using `.on_Success()` or `.on_Fail()` functions, where the `_` is the type of command.  

Here is an exhaustive list of all logging functions:
  - `onSuccess()`
  - `onFail()`
  - `onQuerySuccess()`
  - `onQueryFail()`
  - `onInsertSuccess()`
  - `onInsertFail()`
  - `onUpdateSuccess()`
  - `onUpdateFail()`
  - `onDeleteSuccess()`
  - `onDeleteFail()`

Each of these functions take in one argument, that being a callback function that provides a scope of the state of the command.  

This callback is the type of `SuccessHandler` or `FailHandler`.  

Syntax of `SuccessHandler`:
  - `(cmdData: OnSuccessData) => void`
    - `OnSuccessData`
      - `affectedRows: number?`: Number of affected rows (may be null or undefined if the command was not an update or delete command)
      - `dateIso: string`: Date as an ISO string of when the command occurred.
      - `cmdRaw: string`: Command in its raw format, or otherwise how it would be sent directly from something like MySQL workbench.
      - `cmdSanitized: string`: Command in its sanitized format and how it is sent to the server.
      - `args`: Arguments that were passed along with `cmdSanitized`.

Syntax of `FailHandler`:
  - `(cmdData: OnFailData) => void`
    - `OnFailData`
      - `error: Error`: Error that was thrown during the transaction.
      - `dateIso: string`: Date as an ISO string of when the command occurred.
      - `cmdRaw: string`: Command in its raw format, or otherwise how it would be sent directly from something like MySQL workbench.
      - `cmdSanitized: string`: Command in its sanitized format and how it is sent to the server.
      - `args`: Arguments that were passed along with `cmdSanitized`.

You can use these handlers to properly monitor the state of your commands that are sent to your database.

Here is an example of setting up a `SuccessHandler`:

```ts
const trackCtx = new MyORMContext<Track>(adapterCnn, "Track");
const onSuccess: SuccessHandler = function({ dateIso, cmdRaw, cmdSanitized }) {
    console.log(`Command executed at [${dateIso}]`);
    console.log("Raw", cmdRaw);
    console.log("Sanitized", cmdSanitized);
}
trackCtx.onSuccess(onSuccess);
```

# More Examples

