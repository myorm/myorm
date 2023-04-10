# myorm

MyORM is a library dedicated for interacting with a MySQL database by building transactions using an Object Relationship Model (hence the name `myorm`)

# Table of Contents

  - [Overview](#overview)
    - [Chinook Database](#chinook-database)
    - [Tutorial: Setup Chinook Database](#tutorial-setup-chinook-database)
  - [Initializing](#initializing)
  - [Aliasing](#aliasing)
    - [Examples](#alias-examples)
  - [Querying](#querying)
    - [SELECT and COUNT](#select-and-count)
      - [SELECT examples](#select-examples)
      - [COUNT examples](#count-examples)
    - [WHERE](#where)
      - [WhereBuilder](#wherebuilder)
      - [Chaining and Nesting](#where-chaining)
      - [Tips and Tricks](#where-tips-and-tricks)
      - [Examples](#where-examples)
    - [ORDER BY](#sortby)
      - [Examples](#sortby-examples)
    - [GROUP BY](#groupby)
      - [Examples](#groupby-examples)
    - [LIMIT and OFFSET](#take-and-skip)
      - [TAKE Examples](#take-examples)
      - [OFFSET Examples](#skip-examples)
  - [Inserting](#inserting)
    - [Insert one examples](#insertone-examples)
    - [Insert many examples](#insertmany-examples)
  - [Updating](#updating)
    - [Examples](#update-examples)
  - [Deleting](#deleting)
    - [Examples](#delete-examples)
  - [Including](#including)
  - [Programmatic Views](#programmatic-views)
  - [Logging](#logging)
    


# Overview

This library was built in JSDOC TypeScript, however, for readability sake, TypeScript is used in all examples, accompanied by any (applicable) SQL statements that are generated from the respective code.  

All examples are from the `chinook` database. More details on the `chinook` database can be found [here](https://docs.yugabyte.com/preview/sample-data/chinook/#:~:text=About%20the%20Chinook%20database,from%20an%20Apple%20iTunes%20library.).

If you'd like to set up the chinook database schema for testing or exploration, please follow the instructions on how to [setup chinook](#tutorial-setup-chinook-database) on your local machine.

## Chinook Database

The Chinook database comprises of eleven (11) tables that represent Entertainment media. Although, some, or most, of these records that are in the default snapshot of this database may be out of date, you can still use them to learn SQL in its entirety.  

### Tutorial: Setup Chinook Database

Requirements:
    - Docker
    - (optional) MySQL Workbench (for executing your own commands)

To set up the `chinook database` on your localhost, you can follow this step-by-step tutorial.

  1. Go to https://github.com/traviszuleger/myorm/tree/main/.github/chinook-setup and download the files, `Dockerfile`, `initdb.sql`, and `start-chinook.sh`. (or copy and paste them)  
  2. Place all of the documents listed above in some directory.  
  3. Open up a command shell (or command prompt) and navigate to the directory you placed your documents from step 2.  
  4. Run the commands from `start-chinook.sh`.  
  5. You can now connect to your MySQL database!  
    - Default username: `root`  
    - Default password: `root` (you can change this in the `Dockerfile` file before running the commands from `start-chinook.sh`)  

# Initializing

# Aliasing

__NOTE: The `.groupBy()` function, as described [here](#groupby) aliases for you, making it so `.alias()` will not work, and will instead throw a `MyORMSyntaxError` specifying that you cannot use both `.alias()` and `.groupBy()` in one context.__

As mentioned in the note above, `.groupBy()` also aliases, so using `.alias()` in conjunction with a `.groupBy()` call, then you will get a `MyORMSyntaxError` thrown. This is also the same behavior if you attempt to use multiple `.alias()` functions in conjunction.

Aliasing provides a way to make an interface to your database and being able to work with objects in JavaScript while maintaining conventions. It also just provides a way to make things more readable.  

Aliasing is easy in `MyORM`, as all you need to do is specify an object mapped to the string variant of the column you want to alias. The only difference that is nice here is that you can reference a `model` in your `.alias()` function to see the columns you have access to.

The `.alias()` function, like many other functions in the `MyORMContext` class, returns a new `MyORMContext` with updated type parameters so TypeScript can pick up what you aliased. This means you can actually save that context to another variable and reference it consistently.

The syntax for `.alias()` is as follows:

  - `.alias(modelCallback: (model: TModel) => TAliasedType)`
    - `TModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `TAliasedType`: The object type you provide from the callback function.

__You can also alias the same column to multiple aliases, although, there probably isn't much of a reason for this, the functionality is there.__

## .alias() examples

Example of aliasing `chinook.Track` for future reference:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
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
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
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

# Querying

Much of the syntax in `MyORM` is built like how Microsoft built Entity Framework Core (EFC). There will be small things here and there that either lack or just aren't the same, and that's because performance would hinder due to the difficulties of implementation, or they are intended to be added for future updates.  

This section will go over the querying portion for `MyORM`, which will include the following functions:  
  - **ASYNC** `.select()`: Runs the command. (this may change to a more appropriate function name)
  - **ASYNC** `.count()`: Runs the command with the `.where()` conditions applied, returning only a number that represents the number of records in that query.
  - `.where(modelCallback: (model: {[K in keyof TModel]: WhereBuilder}))`: Applies filtering conditions to the query.
    - `TModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
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
            - `.and(modelCallback: (model: {[K in keyof TModel]: WhereBuilder}))`: Nests the condition with a conditional `AND`.
            - `.or(modelCallback: (model: {[K in keyof TModel]: WhereBuilder}))`: Nests the condition with a conditional `OR`.
            - Each of the `.and()` and `.or()` functions return a new reference of themselves. These chain the condition with a conditional `AND` or `OR`, respectively.
        - `TPropertyType` represents the respective type to the property you reference from the `model` in `modelCallback`.
  - `.groupBy(modelCallback: (model: TModel) => TAliasedType, aggregates: Aggregates)`: Applies grouping to the query as defined by SQL's `GROUP BY` syntax.
    - `TModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `TAliasedType`: The new type your query will work on from all calls thereafter.
    - `Aggregates`: 
  - `.sortBy(modelCallback: (model: {[K in keyof TModel]: SortByKeyConfig<TTableModel> & DirectionCallbacks<TTableModel>}) => SortByKeyConfig<TTableModel>|SortByKeyConfig<TTableModel>[])`: Applies sorting conditions to the query based off the keys and directions specified.
    - `TModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.
    - `SortByKeyConfig`: Represents an interface of `{ column: keyof TModel, direction: "ASC"|"DESC" }`. 
    - `DirectionCallbacks`: Represents an interface of `{ asc: () => SortByKeyConfig, desc: () => SortByKeyConfig }`.
      - __NOTE: Neither of the following functions are required to be called, the default is ascending order.__
      - `.asc()`: Marks the direction to sort to be ascending.
        - Synonym: `.ascending()`
      - `.desc()`: Marks the direction to sort to be descending.
        - Synonym: `.descending()`
  - `.take(limit: number)`: Applies a limit to the number of records to get from the query.
  - `.skip(offset: number)`: Applies an offset to where the records should start to get queried.

Every subsection following this will break down everything in more detail, with examples.

## .select() and .count()

The `.select()` and `.count()` functions are pretty straight-forward, they will execute your queries given the configurations.  

If the `.select()` function is ran, then it will return all of the records from your view, applying any filters from `.where()`, in the order specified from `.sortBy()`, and grouped by the configuration specified by `.groupBy()`. If `.groupBy()` is specified or `.alias()` is specified, this will return your aliased model, and not the initial Type you specified in the constructor.  

If the `.count()` function is ran, then it will return a number representing all of the records that would return from your query.

### .select() examples

Example of querying all records from `chinook.Track`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx.select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT * 
    FROM `Track`
```

### .count() examples

Example of querying the count of all records from `chinook.Track`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx.select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT COUNT(*) AS `$$count` 
    FROM `Track`
```

## .where()

__NOTE: As of v1.0, There is currently no way to negate an entire condition. You will have to apply [De Morgan's Law](https://en.wikipedia.org/wiki/De_Morgan%27s_laws) in order to achieve negation for now.__

The `.where()` function is a complex function, as it has to cover nesting and chaining of conditions.  

You can use the `.where()` function as many times on your `MyORMContext`, and every time it will chain those conditions together, but the function is intended to be used once with all of the functions, **so please open an issue if you notice a bug with this.**  

The `.where()` function takes in a callback function, where there is one argument, `model`, which is a type of the original model that you provided during construction. This `model` object works on a proxy, where an intercept will take the property you reference and create a new `WhereBuilder` out of it.  

### WhereBuilder

You will never construct a `WhereBuilder` class object directly, it will only ever be created for you to use in your `modelCallback` in your `.where()` function.  

The `WhereBuilder` class provides a library of functions for constructing conditions, like checking if a column value is equal to a variable, etc.

In a library like Entity Framework Core (EFC), the syntax uses the actual programming language's operators, however, JavaScript doesn't provide a way to override operators, and so it isn't feasible to mimic this behavior, therefore, you will follow these functions:

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
      - `.and(modelCallback: (model: {[K in keyof TModel]: WhereBuilder}))`: Nests the condition with a conditional `AND`.
      - `.or(modelCallback: (model: {[K in keyof TModel]: WhereBuilder}))`: Nests the condition with a conditional `OR`.
      - Each of the `.and()` and `.or()` functions return a new reference of themselves. These chain the condition with a conditional `AND` or `OR`, respectively.
    - `TPropertyType` represents the respective type to the property you reference from the `model` in `modelCallback`.

As mentioned above, each of these functions will return a `.and()` or `.or()` function. These functions will take the same exact syntax as what you pass into your `.where()` function.  

### .where() chaining

This is where things might get confusing--  

When we work with any language with boolean or mathematical operators, we need to specify a precedence... there is no precedence in SQL. Everything is read from left to right, so therefore, nesting and chaining is extremely important.  

`MyORM` provides a way to nest and chain indefinitely as long as you follow these two rules.

  - If you want to chain your conditions, add `.and()` or `.or()` on the `.and()` or `.or()` you want to chain to.
  - If you want to nest your conditions, add `.and()` or `.or()` on the condition operators from `WhereBuilder` (e.g., `.eq()`, `.lt()`, etc.)

If you follow these two rules, you'll accomplish what you want.  

There is one drawback to these two rules, your code can get messy, as there will be many parentheses and nests (if you style your code to assist you)  

### .where() tips and tricks

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
    .where(m => m.Composer.eq("AC/DC")
        .and(m => m.Bytes.gt(1))
        .and(m => m.Name.eq("Dog Eat Dog"))
        .or(m => m.Composer.eq("Apocalyptica")
            .and(m => m.Bytes.gt(200)
                .or(m => m.Name.eq("Enter Sandman")))))
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

### .where() examples

Example of querying from `chinook.Track` given one condition, `WHERE c1`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC"))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
```

Example of querying from `chinook.Track` given two conditions, `WHERE c1 AND c2`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC")
        .and(m => m.Name.eq("Dog Eat Dog")))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        AND `Track`.`Name` = 'Dog Eat Dog'
```

Example of querying from `chinook.Track` given three conditions, `WHERE c1 AND (c2 OR c3)`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC")
        .and(m => m.Name.eq("Dog Eat Dog")
            .or(m => m.Name.eq("Go Down"))))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        AND (`Track`.`Name` = 'Dog Eat Dog'
            OR `Track`.`Name` = 'Go Down')
```

Example of querying from `chinook.Track` given four conditions, `WHERE (c1 OR c2) AND (c2 OR c3)`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC")
        .or(m => m.Composer.eq("Apocalyptica"))
        .and(m => m.Name.eq("Dog Eat Dog")
            .or(m => m.Name.eq("Enter Sandman"))))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    WHERE `Track`.`Composer` = 'AC/DC'
        OR `Track`.`Composer` = 'Apocalyptica'
        AND (`Track`.`Name` = 'Dog Eat Dog'
            OR `Track`.`Name` = 'Enter Sandman')
```

__NOTE: As of v1.0, there is no way to wrap parentheses around the first two conditions. This is minor, but will be intended to get fixed eventually__

This last example will go more into the functions you have access to, as well as going deep into the complexity of chaining and nesting.

Example of querying from `chinook.Track` given nine (9) conditions:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC")
        .and(m => m.Name.eq("Dog Eat Dog")
            .or(m => m.Name.contains("go")
                .and(m => m.Name.contains("down")
                    .and(m => m.Bytes.lessThan(2 ** 53))))
            .or(m => m.Name.contains("let")
                .and(m => m.Name.contains("rock")
                    .and(m => m.Bytes.lessThan(2 ** 53)))))
        .and(m => m.AlbumId.eq(4)))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
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

The `.sortBy()` function is a simple function, where all you must do is specify the keys that you want to sort your query inside of an array or by itself.  

Unlike the `.where()` function, the `.sortBy()` function will override any pre-existing `.sortBy()` calls.

The `.sortBy()` function takes in a callback function, where there is one argument, `model`, which is a type of the original model that you provided during construction. This `model` object works on a proxy, where an intercept will take the property you reference and return itself a long with four (4) functions you can use to specify the direction, `.asc()`, `.ascending()`, `.desc()`, and `.descending()`.  

If you wish to sort by one key, you just need to specify the one property and direction alone. If you want to sort by multiple keys, you need to wrap all of the property/direction references in an array.

You do **NOT** need to specify one of the four direction functions. The default is ascending order, as SQL syntax intends.

### .sortBy() examples

Example of querying from `chinook.Track` sorted in ascending order by `Bytes` (implicit):

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .sortBy(m => m.Bytes)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    ORDER BY Bytes ASC
```

Example of querying from `chinook.Track` sorted in ascending order by `Bytes` (explicit):

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .sortBy(m => m.Bytes.asc())
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    ORDER BY Bytes ASC
```

Example of querying from `chinook.Track` sorted in descending order by `Bytes`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .sortBy(m => m.Bytes.desc())
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    ORDER BY Bytes DESC
```

Example of querying from `chinook.Track` sorted in descending order by `Composer`, then in ascending order by `Bytes`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .sortBy(m => [m.Composer.desc(), m.Bytes])
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    ORDER BY Composer DESC
        ,Bytes ASC
```

## .groupBy()

__NOTE: The `.groupBy()` function aliases for you, making it so `.alias()` will not work, and will instead throw a `MyORMSyntaxError` specifying that you cannot use both `.alias()` and `.groupBy()` in one context.__

The `.groupBy()` function is a relatively simple function, where you must provide an object where the keys you specify are aliases of the columns (by property reference) you want to alias from.

The `.groupBy()` function takes in a callback function, where there is one argument, `model`, which is a type of the original model that you provided during construction. This `model` object works on a proxy, where an intercept will take the property you reference and return the string variant of that property. This is intended to be used in the object.

Unlike the `.where()` function, the `.sortBy()` function will override any pre-existing `.sortBy()` calls.

It is important to note, just like `.alias()`, you can only alias your properties of the immediate table on root keys of the object you return. You can only alias properties on nested objects of your returned object when the column being aliased is from an included table, (see more on included tables [here](#including)) 

Unlike `.alias()`, `.groupBy()` has access to SQL aggregate functions, these functions are as follows:
  - `.count()`: Gets the total count for the grouped record.
  - `.avg(modelCallback: (m: TModel) => string)`: Gets the average of the specified column for the grouped record.
  - `.min(modelCallback: (m: TModel) => string)`: Gets the minimum value of the specified column for the grouped record.
  - `.max(modelCallback: (m: TModel) => string)`: Gets the maximum value of the specified column for the grouped record.
  - `.sum(modelCallback: (m: TModel) => string)`: Gets the sum of all values for the specified column of the grouped record.
  - `TModel`: TTableModel type from `MyORMContext<TTableModel>` that represents the Table's columns.

You can get access to these aggregate functions with a second parameter in the `modelCallback` argument in `.groupBy()`, `aggregates`.

### .groupBy() examples

Example of querying all records from `chinook.Track` grouped by `Composer`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .groupBy(m => ({
        composer: m.Composer
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer` AS `composer`
    FROM `Track`
    GROUP BY `Track`.`Composer`
```

Example of querying all records from `chinook.Track` grouped by `Composer`, where also getting the aggregate SUM of `Bytes`.

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .groupBy((m,a) => ({
        composer: m.Composer,
        sumBytes: a.sum(m => m.Bytes)
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer` AS `composer`
        ,SUM(Bytes) AS sumBytes
    FROM `Track`
    GROUP BY `Track`.`Composer`
```

Example of querying all records from `chinook.Track` grouped by `Composer` and `AlbumId`, where also getting the aggregate SUM, MIN, MAX, and AVG of `Bytes`.

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .groupBy((m,a) => ({
        composer: m.Composer,
        albumId: m.AlbumId,
        avgBytes: a.avg(m => m.Bytes),
        minBytes: a.min(m => m.Bytes),
        maxBytes: a.max(m => m.Bytes),
        sumBytes: a.sum(m => m.Bytes),
    }))
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT `Track`.`Composer` AS `composer`
        ,`Track`.`AlbumId` AS `albumId`
        ,AVG(Bytes) AS avgBytes
        ,MIN(Bytes) AS minBytes
        ,MAX(Bytes) AS maxBytes
        ,SUM(Bytes) AS sumBytes
    FROM `Track`
    GROUP BY `Track`.`Composer`
        ,`Track`.`AlbumId`
```

## .take() and .skip()

__NOTE: As mentioned in this section, you can use `.take()` whenever you'd like, but in order to use `.skip()`, you **MUST** also use `.take()`.__

The `.take()` and `.skip()` functions are the simplest, and barely warrant a reason to have a section for them, but there are a few notes to mention on these functions.  

The function `.take()` will limit the number of records your query will grab specified by the argument passed into `.take()`.  

The function `.skip()` will skip the number of records specified by the argument passed into `.take()`, and start at the next index. Since MySQL does not support `OFFSET` without a `LIMIT`, you **MUST** use `.take()` in conjunction with `.take()`, otherwise, you will receive a `MyORMSyntaxError`.

### .take() examples

Example of querying the first 5 records from `chinook.Track`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .take(5)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    LIMIT 5
```

### .skip() examples

Example of querying the first 5 records **AFTER** skipping the first 10 records. from `chinook.Track`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .skip(10)
    .take(5)
    .select();
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
SELECT *
    FROM `Track`
    LIMIT 5
    OFFSET 10
```

# Inserting

__NOTE: As of v1.0, records that have included tables will be inserted, but the related table information will not be inserted.__

Inserting into your table is as simple as passing in your record(s) into the `.insertOne()` or `.insertMany()` functions. These inserts are appropriately mapped to make sure that the right columns are inserted. Additionally, if an `identityKey` was specified in the constructor, the appropriate inserted ids will be mapped back to the inserted records, which is then returned back to you.

All `.insert` functions support inserting the object(s) as an aliased type.

Inserting has two main functions:

  - `.insertOne(record: TModel)`: Inserts one record into the table. Returns the record back with the appropriate id mapped back to it/ (if `identityKey` was specified in constructor)
  - `.insertMany(records: TModel[])`: Inserts many records into the table. Returns the records back with appropriate ids mapped back to them. (if `identityKey` was specified in constructor)

Each of these functions returns the same record(s) back, with the mapped primary key to the appropriate inserted id (if an `identityKey` was specified).

## .insertOne() examples

Example of inserting one record into `chinook.Track`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const track = await trackCtx.insertOne({
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

Example of inserting one record into `chinook.Track` when `Track` is aliased.

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
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
    .insertOne({
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

## .insertMany() examples

Example of inserting multiple records with all required properties filled out into `chinook.Customer`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const customerCtx = new MyORMContext<Customer>(pool, "Customer"); 
const customer = await customerCtx
    .insertMany([{
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

Example of inserting multiple records with all required properties filled out into `chinook.Customer` when `Customer` is aliased:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const customerCtx = new MyORMContext<Customer>(pool, "Customer"); 
const customer = await customerCtx
        .alias(m => ({
            id: m.CustomerId,
            first: m.FirstName,
            last: m.LastName,
            email: m.Email
        }))
        .insertMany([{
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

Example of inserting multiple records with all required properties and some nullable properties (different for each one) filled out into `chinook.Customer`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const customerCtx = new MyORMContext<Customer>(pool, "Customer"); 
const customer = await customerCtx
        .insertMany([{
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

Updating records in your table requires using the `.where()` function along with `.update()`. Neglecting to use the `.where()` function will throw an `Error`, stating that the syntax you provided __would__ update your entire table, however, the `Error` is thrown to protect your table.  
**IF** you are intending on updating your entire table, you must use the function `.updateAll()`, but you also must pass into the `options` object argument in the constructor of your `MyORMContext` the property and value, `allowUpdateOnAll: true`.
If you do not set this option, you will also receive an error in `.updateAll()`. This redundancy may be annoying, but is intended to make sure you, as the end-user, are 100% sure you are updating.

__WARNING: These protective measures do not prevent you from accidentally doing something like `.where(m => m.Id > 0)`.__

The syntax for the `.update()` function is as follows:

  - `.update(modelCallback: (model: Partial<TAliasedType>) => Partial<TAliasedType>)`: Updates all columns specified from `model` on all records that apply to the filter created by `.where()`.
  - `.updateAll(modelCallback: (model: Partial<TAliasedType>) => Partial<TAliasedType>)`: Updates all columns specified from `model` on all records. This requires the `{ allowUpdateOnAll: true }` option in `options` of the `MyORMContext` constructor. If `.where()` was specified, this function behaves exactly like `.update()`. 

This function returns a `number` denoting the total number of rows that were affected by the number.

All you must do is specify your `.where()` function, then call `.update()` with an object passed in as an argument that specifies what you would like to update.

## .update() examples

Example of updating `chinook.Customer`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const track = await customerCtx
    .insertOne({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
const rowsAffected = await customerCtx
    .where(m => m.CustomerId.eq(99999))
    .update({
        FirstName: "test2"
    });
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
UPDATE `Customer`
    SET `FirstName` = 'test2'
    WHERE `Customer`.`CustomerId` = 99999
```

Example of updating `chinook.Customer` when `Customer` is aliased:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const track = await customerCtx
    .insertOne({
        CustomerId: 99999,
        FirstName: "test",
        LastName: "customer",
        Email: "testcustomer@test.com"
    });
const rowsAffected = await customerCtx
    .alias(m => ({
        first: m.FirstName
    }))
    .where(m => m.CustomerId.eq(99999))
    .update({
        first: "test2"
    });
```

This will generate the following SQL (this is sanitized when it is actually sent):

```sql
UPDATE `Customer`
    SET `FirstName` = 'test2'
    WHERE `Customer`.`CustomerId` = 99999
```

# Deleting

## .delete() examples

# Including

# Programmatic Views

# Logging

# Tests

